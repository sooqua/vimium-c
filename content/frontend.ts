var VHud: VHUDTy, VPort: VPortTy, VEvent: VEventModeTy
  , VimiumInjector: VimiumInjectorTy | undefined | null;
if (Build.BTypes & BrowserType.Chrome && Build.BTypes & ~BrowserType.Chrome) { var browser: unknown; }

(function () {
  interface EscF {
    <T extends Exclude<HandlerResult, HandlerResult.ExitPassMode>> (this: void, i: T): T;
    (this: void, i: HandlerResult.ExitPassMode): HandlerResult.Prevent;
  }
  interface Port extends chrome.runtime.Port {
    postMessage<K extends keyof FgRes>(request: Req.fgWithRes<K>): 1;
    postMessage<K extends keyof FgReq>(request: Req.fg<K>): 1;
  }
  interface SpecialCommands {
    [kFgCmd.reset] (this: void): void;
    [kFgCmd.showHelp] (msg?: number | "e"): void;
  }

  let KeydownEvents: KeydownCacheArray, keyMap: KeyMap
    , thisCore: Writable<ContentWindowCore> | undefined
    , currentKeys = "", isEnabled = false, isLocked = false
    , mappedKeys = null as SafeDict<string> | null, nextKeys = null as KeyMap | ReadonlyChildKeyMap | null
    , esc = function<T extends Exclude<HandlerResult, HandlerResult.ExitPassMode>> (i: T): T {
      currentKeys = ""; nextKeys = null; return i;
    } as EscF
    , onKeyup2: ((this: void, event: Pick<KeyboardEvent, "keyCode">) => void) | null | undefined
    , passKeys = null as SafeEnum | null | "", isPassKeysReverted = false
    , onWndFocus = function (this: void): void { /* empty */ }, onWndBlur2: ((this: void) => void) | undefined | null
    , exitPassMode: ((this: void) => void) | undefined | null
    , OnOther: BrowserType = !(Build.BTypes & ~BrowserType.Chrome) || !(Build.BTypes & ~BrowserType.Firefox)
          || !(Build.BTypes & ~BrowserType.Edge)
        ? Build.BTypes as number
        : Build.BTypes & BrowserType.Edge && !!(window as {} as {StyleMedia: unknown}).StyleMedia ? BrowserType.Edge
        : Build.BTypes & BrowserType.Firefox && browser ? BrowserType.Firefox
        : BrowserType.Chrome
    /** its initial value should be 0, need by {@link #hook} */
    , browserVer: BrowserVer = 0 // should be used only if BTypes includes Chrome
    , isCmdTriggered: BOOL = 0
    , isTop = top === window
    , needToRetryParentClickable: BOOL = 0
    , safer = Object.create as { (o: null): any; <T>(o: null): SafeDict<T>; }
    , coreTester: { name_: string, rand_: number, recvTick_: number, sendTick_: number,
        encrypt_ (trustedRand: number, unsafeRand: number): string,
        compare_: Parameters<SandboxGetterFunc>[0] }
    ;

  function post<K extends keyof FgReq>(this: void, request: FgReq[K] & Req.baseFg<K>): 1 {
    return (vPort._port as Port).postMessage(request);
  }

  function mapKey(this: void, /* not "" */ char: string, event: EventControlKeys): string {
    let key = VKey.key_(event, char), mapped: string | undefined, chLower: string;
    if (mappedKeys) {
      mapped = mappedKeys[key];
      key = mapped || ((mapped = mappedKeys[chLower = char.toLowerCase()])
                        ? VKey.key_(event, char === chLower ? mapped : mapped.toUpperCase()) : key);
    }
    return key;
  }
  function isEscape(event: KeyboardEvent): boolean {
    let ch: string | undefined;
    if (mappedKeys && event.keyCode !== kKeyCode.ime) {
      ch = VKey.char_(event);
      ch = ch && mapKey(ch, event);
    }
    return ch ? ch === "<esc>" || ch === "<c-[>" : VKey.isRawEscape_(event);
  }
  function checkKey(char: string, code: kKeyCode, event: EventControlKeys
      ): HandlerResult.Nothing | HandlerResult.Prevent | HandlerResult.Esc | HandlerResult.AdvancedEscEnum {
    // when checkValidKey, Vimium C must be enabled, so passKeys won't be `""`
    let key = VKey.key_(event, char);
    if (passKeys && (key in <SafeEnum> passKeys) !== isPassKeysReverted) {
      return esc(HandlerResult.Nothing);
    }
    mappedKeys && (key = mapKey(char, event));
    if (key === "<esc>" || key === "<c-[>") {
      return nextKeys ? (esc(HandlerResult.ExitPassMode), HandlerResult.Prevent)
        : key[1] === "c" ? HandlerResult.Esc : HandlerResult.AdvancedEscEnum;
    }
    let j: ReadonlyChildKeyMap | ValidKeyAction | undefined;
    if (!nextKeys || (j = nextKeys[key]) == null) {
      j = keyMap[key];
      if (j == null) {
        return esc(HandlerResult.Nothing);
      }
      if (j !== KeyAction.cmd && nextKeys) { currentKeys = ""; }
    }
    currentKeys += key;
    if (j === KeyAction.cmd) {
      post({ H: kFgReq.key, k: currentKeys, l: code });
      isCmdTriggered = 1;
      return esc(HandlerResult.Prevent);
    } else {
      nextKeys = j !== KeyAction.count ? j : keyMap;
      return HandlerResult.Prevent;
    }
  }
  function onEscDown(event: KeyboardEvent, key: kKeyCode): HandlerResult {
    let action = HandlerResult.Prevent, { repeat } = event
      , { activeElement: activeEl, body } = document;
    /** if `notBody` then `activeEl` is not null */
    if (!repeat && VDom.UI.removeSelection_()) {
      /* empty */
    } else if (repeat && !KeydownEvents[kKeyCode.esc] && activeEl !== body) {
      (Build.BTypes & ~BrowserType.Firefox ? typeof (activeEl as Element).blur === "function"
          : (activeEl as Element).blur) &&
      (activeEl as HTMLElement | SVGElement).blur();
    } else if (!isTop && activeEl === body) {
      InsertMode.focusUpper_(key, repeat, event);
      action = HandlerResult.PassKey;
    } else {
      action = HandlerResult.Default;
    }
    return action;
  }
  function onKeydown(event: KeyboardEvent): void {
    let keyChar: string, key = event.keyCode, action: HandlerResult;
    if (!isEnabled
        || (Build.MinCVer >= BrowserVer.Min$Event$$IsTrusted || !(Build.BTypes & BrowserType.Chrome) ? !event.isTrusted
            : event.isTrusted === false) // skip checks of `instanceof KeyboardEvent` if checking `!.keyCode`
        || !key) { return; }
    if (VScroller.keyIsDown_ && events.OnScrolls_[0](event)) { return; }
    if (Build.BTypes & BrowserType.Firefox
        && (!(Build.BTypes & ~BrowserType.Firefox) ? InsertMode.lock_
          : InsertMode.lock_ && OnOther === BrowserType.Firefox)
        && !VDom.isInDOM_(InsertMode.lock_ as LockableElement, document)) {
      InsertMode.lock_ = null;
    }
    if (action = VKey.bubbleEvent_(event)) { /* empty */ }
    else if (InsertMode.isActive_()) {
      const g = InsertMode.global_;
      if (g ? !g.code ? isEscape(event) : key === g.code && VKey.getKeyStat_(event) === g.stat
          : key > kKeyCode.maxNotFn && key < kKeyCode.minNotFn
          ? ((action = checkKey(VKey.getKeyName_(event), key, event))
              & ~HandlerResult.AdvancedEscFlag) === HandlerResult.Esc
          : isEscape(event)
      ) {
        if (InsertMode.lock_ === document.body && InsertMode.lock_ || !isTop && innerHeight < 3) {
          event.repeat && InsertMode.focusUpper_(key, true, event);
          action = HandlerResult.PassKey;
        } else {
          action = g && g.passExitKey ? HandlerResult.Nothing : HandlerResult.Prevent;
          InsertMode.exit_(event);
        }
      }
    }
    else if (key > kKeyCode.maxNotPrintable && key !== kKeyCode.ime
        || key === kKeyCode.backspace || key === kKeyCode.tab
        || key === kKeyCode.esc || key === kKeyCode.enter) {
      if (keyChar = VKey.char_(event)) {
        action = checkKey(keyChar, key, event);
        if ((action & ~HandlerResult.AdvancedEscFlag) === HandlerResult.Esc) {
          action = action & HandlerResult.AdvancedEscFlag ? onEscDown(event, key) : HandlerResult.Nothing;
        }
        if (action === HandlerResult.Nothing
            && InsertMode.suppressType_ && keyChar.length < 2 && !VKey.getKeyStat_(event)) {
          action = HandlerResult.Prevent;
        }
      }
    }
    if (action < HandlerResult.MinStopOrPreventEvents) { return; }
    if (action > HandlerResult.MaxNotPrevent) {
      VKey.prevent_(event);
    } else {
      VKey.Stop_(event);
    }
    KeydownEvents[key] = 1;
  }
  function onKeyup(event: KeyboardEvent): void {
    let key = event.keyCode;
    if (!isEnabled
        || (Build.MinCVer >= BrowserVer.Min$Event$$IsTrusted || !(Build.BTypes & BrowserType.Chrome) ? !event.isTrusted
            : event.isTrusted === false) // skip checks of `instanceof KeyboardEvent` if checking `!.keyCode`
        || !key) { return; }
    VScroller.scrollTick_(0);
    isCmdTriggered = 0;
    if (InsertMode.suppressType_ && getSelection().type !== InsertMode.suppressType_) {
      events.setupSuppress_();
    }
    if (KeydownEvents[key]) {
      KeydownEvents[key] = 0;
      VKey.prevent_(event);
    } else if (onKeyup2) {
      onKeyup2(event);
    }
  }

  function onFocus(this: void, event: Event | FocusEvent): void {
    if (Build.MinCVer >= BrowserVer.Min$Event$$IsTrusted || !(Build.BTypes & BrowserType.Chrome)
        ? !event.isTrusted : event.isTrusted === false) { return; }
    // on Firefox, target may also be `document`
    let target: EventTarget | Element | Window | Document = event.target;
    if (target === window) {
      return onWndFocus();
    }
    if (!isEnabled || Build.BTypes & BrowserType.Firefox && target === document) { return; }
    /**
     * Notes:
     * according to test, Chrome Password Saver won't fill fields inside a shadow DOM
     * it's safe to compare .lock and doc.activeEl here without checking target.shadowRoot,
     *   and .shadowRoot should not block this check
     * DO NOT stop propagation
     * check `InsertMode.lock !== null` first, so that it needs less cost for common (plain) cases
     * use `lock === doc.active`, because:
     *   `lock !== target` ignores the case a blur event is missing or not captured;
     *   `target !== doc.active` lets it mistakenly passes the case of `target === lock === doc.active`
     */
    const lock = InsertMode.lock_;
    if (lock !== null && lock === document.activeElement) { return; }
    if (target === VDom.UI.box_) { return VKey.Stop_(event); }
    const sr = VDom.GetShadowRoot_(target as Element);
    if (sr) {
      let path = event.path, top: EventTarget | undefined,
      /**
       * isNormalHost is true if one of:
       * - Chrome is since BrowserVer.MinOnFocus$Event$$Path$IncludeOuterElementsIfTargetInShadowDOM
       * - `event.currentTarget` (`this`) is a shadowRoot
       */
      isNormalHost = Build.MinCVer >= BrowserVer.MinOnFocus$Event$$Path$IncludeOuterElementsIfTargetInShadowDOM
          && !(Build.BTypes & ~BrowserType.Chrome)
        ? (top = (path as EventPath)[0]) !== target
        : !!(top = path && path[0]) && top !== window && top !== target,
      len = isNormalHost ? Build.MinCVer >= BrowserVer.Min$Event$$path$IsStdArrayAndIncludesWindow
              || !(Build.BTypes & BrowserType.Chrome) // in fact, FF66 has no event.path
        ? (path as EventTarget[]).indexOf(target) : [].indexOf.call(path as NodeList, target) : 1;
      isNormalHost ? (target = top as Element) : (path = [sr]);
      while (0 <= --len) {
        // root is target or inside target, so always a Node
        const root = (path as EventPath)[len] as Node;
        if (root.nodeType !== kNode.DOCUMENT_FRAGMENT_NODE
            || (root as ShadowRoot).vimiumListened === ShadowRootListenType.Full) { continue; }
        root.addEventListener("focus", onShadow, true);
        root.addEventListener("blur", onShadow, true);
        (root as ShadowRoot).vimiumListened = ShadowRootListenType.Full;
      }
    }
    if (VDom.getEditableType_<LockableElement>(target)) {
      VScroller.current_ = target;
      if (InsertMode.grabBackFocus_) {
        (InsertMode.grabBackFocus_ as Exclude<typeof InsertMode.grabBackFocus_, boolean>)(event, target);
        return;
      }
      InsertMode.lock_ = target;
      if (InsertMode.mutable_) {
        if (document.activeElement !== document.body) {
          InsertMode.last_ = target;
        }
      }
    } else {
      VScroller.current_ = Build.BTypes & ~BrowserType.Firefox
          ? VDom.SafeEl_(target as Element) || VScroller.current_ : target as SafeElement;
    }
  }
  function onBlur(this: void, event: Event | FocusEvent): void {
    if (!isEnabled
        || (Build.MinCVer >= BrowserVer.Min$Event$$IsTrusted || !(Build.BTypes & BrowserType.Chrome)
            ? !event.isTrusted : event.isTrusted === false)) { return; }
    const target: EventTarget | Element | Window | Document = event.target;
    if (target === window) { return onWndBlur(); }
    if (Build.BTypes & BrowserType.Firefox && target === document) { return; }
    let path = event.path as EventPath | undefined, top: EventTarget | undefined
      , same = Build.MinCVer >= BrowserVer.MinOnFocus$Event$$Path$IncludeOuterElementsIfTargetInShadowDOM
            && !(Build.BTypes & ~BrowserType.Chrome)
          ? (top = (path as EventPath)[0]) === target
          : !(top = path && path[0]) || top === window || top === target
      , sr = VDom.GetShadowRoot_(target as Element);
    if (InsertMode.lock_ === (same ? target : top)) {
      InsertMode.lock_ = null;
      InsertMode.inputHint_ && !InsertMode.hinting_ && document.hasFocus() && InsertMode.exitInputHint_();
    }
    if (!sr || target === VDom.UI.box_) { return; }
    if (same) {
      sr.vimiumListened = ShadowRootListenType.Blur;
      return;
    }
    for (let len = Build.MinCVer >= BrowserVer.Min$Event$$path$IsStdArrayAndIncludesWindow
                    || !(Build.BTypes & BrowserType.Chrome)
              ? (path as EventTarget[]).indexOf(target) : [].indexOf.call(path as NodeList, target)
          ; 0 <= --len; ) {
      // root is target or inside target, so always a Node
      const root = (path as EventPath)[len] as Node;
      if (root.nodeType !== kNode.DOCUMENT_FRAGMENT_NODE) { continue; }
      root.removeEventListener("focus", onShadow, true);
      root.removeEventListener("blur", onShadow, true);
      (root as ShadowRoot).vimiumListened = ShadowRootListenType.None;
    }
  }
  function onActivate(event: UIEvent | MouseEvent): void {
    if (Build.MinCVer >= BrowserVer.Min$Event$$IsTrusted || !(Build.BTypes & BrowserType.Chrome)
        ? event.isTrusted : event.isTrusted !== false) {
      const path = event.path,
      el = (!(Build.BTypes & ~BrowserType.Chrome) && Build.MinCVer >= BrowserVer.MinEnsured$ActivateEvent$$Path || path)
          && (Build.MinCVer >= BrowserVer.Min$ActivateEvent$$Path$IncludeWindowAndElementsIfListenedOnWindow
            || !(Build.BTypes & BrowserType.Chrome)
            || (path as EventTarget[]).length > 1)
          ? (path as EventTarget[])[0] as Element : event.target as Element;
      VScroller.current_ = Build.BTypes & ~BrowserType.Firefox ? VDom.SafeEl_(el) : el as SafeElement | null;
    }
  }
  function onWndBlur(this: void): void {
    VScroller.scrollTick_(0);
    onWndBlur2 && onWndBlur2();
    exitPassMode && exitPassMode();
    KeydownEvents = safer(null);
    isCmdTriggered = 0;
    injector || (<RegExpOne> /a?/).test("");
    esc(HandlerResult.ExitPassMode);
  }
  function onShadow(this: ShadowRoot, event: FocusEvent): void {
    if (Build.MinCVer >= BrowserVer.Min$Event$$IsTrusted || !(Build.BTypes & BrowserType.Chrome)
        ? !event.isTrusted : event.isTrusted === false) { return; }
    if (isEnabled && event.type === "focus") {
      return onFocus(event);
    }
    if (!isEnabled || this.vimiumListened === ShadowRootListenType.Blur) {
      const r = this.removeEventListener.bind(this) as Element["removeEventListener"];
      r("focus", onShadow, true); r("blur", onShadow, true);
      this.vimiumListened = ShadowRootListenType.None;
    }
    if (isEnabled) {
      onBlur(event);
    }
  }

  const injector = VimiumInjector,
  hook = (function (action: HookAction): void {
    let f = action ? removeEventListener : addEventListener;
    if (Build.MinCVer < BrowserVer.Min$ActivateEvent$$Path$IncludeWindowAndElementsIfListenedOnWindow
        && Build.BTypes & BrowserType.Chrome) {
      Build.BTypes & ~BrowserType.Chrome && OnOther !== BrowserType.Chrome ||
      (action || browserVer < BrowserVer.Min$ActivateEvent$$Path$IncludeWindowAndElementsIfListenedOnWindow) &&
      f.call(document, "DOMActivate", onActivate, true);
      if (action === HookAction.SuppressActivateOnDocument) { return; }
    }
    f("keydown", onKeydown, true);
    f("keyup", onKeyup, true);
    action !== HookAction.Suppress && f("focus", onFocus, true);
    f("blur", onBlur, true);
    f(Build.BTypes & ~BrowserType.Chrome && OnOther !== BrowserType.Chrome
        ? "click" : "DOMActivate", onActivate, true);
  }),
  Commands: {
    [K in kFgCmd & number]:
      K extends keyof SpecialCommands ? SpecialCommands[K] :
      (this: void, count: number, options: CmdOptions[K], key?: -42) => void;
  } = [
    /* kFgCmd.framesGoBack: */ function (rawStep: number, options: CmdOptions[kFgCmd.framesGoBack]): void {
      const maxStep = Math.min(Math.abs(rawStep), history.length - 1),
      reuse = options.reuse,
      realStep = rawStep < 0 ? -maxStep : maxStep;
      if ((!(Build.BTypes & ~BrowserType.Chrome) || Build.BTypes & BrowserType.Chrome && OnOther === BrowserType.Chrome)
          && maxStep > 1
          && (Build.MinCVer >= BrowserVer.Min$Tabs$$goBack || browserVer >= BrowserVer.Min$Tabs$$goBack)
          || maxStep && reuse
      ) {
        post({ H: kFgReq.framesGoBack, s: realStep, r: reuse });
      } else {
        maxStep && history.go(realStep);
      }
    },
    /* kFgCmd.findMode: */ VFind.activate_,
    /* kFgCmd.linkHints: */ VHints.activate_,
    /* unhoverLast: */ function (this: void): void {
      VDom.hover_(null);
      HUD.tip_("The last element is unhovered");
    },
    /* kFgCmd.marks: */ VMarks.activate_,
    /* kFgCmd.goToMarks: */ VMarks.GoTo_,
    /* kFgCmd.scroll: */ VScroller.activate_,
    /* kFgCmd.visualMode: */ VVisual.activate_,
    /* kFgCmd.vomnibar: */ VOmni.activate_,
    /* kFgCmd.reset: */ function (): void {
      const a = InsertMode;
      VScroller.current_ = VDom.lastHovered_ = a.last_ = a.lock_ = a.global_ = null;
      a.mutable_ = true;
      a.ExitGrab_(); events.setupSuppress_();
      VHints.clean_(); VVisual.deactivate_();
      VFind.init_ || VFind.deactivate_(FindNS.Action.ExitNoAnyFocus);
      onWndBlur();
    },

    /* kFgCmd.toggle: */ function (_0: number, options: CmdOptions[kFgCmd.toggle]): void {
      const key = options.k, backupKey = "_" + key as string as typeof key,
      cache = VKey.safer_(VDom.cache_), cur = cache[key];
      let val = options.v, u: undefined;
      if (val === null && (cur === true || cur === false)) {
        val = !cur;
      }
      if (cache[backupKey] === u) {
        (cache as Generalized<typeof cache>)[backupKey] = cur;
      } else if (cur === val) {
        val = cache[backupKey];
        cache[backupKey] = u as never;
      }
      (cache as Generalized<typeof cache>)[key] = val as typeof cur;
      let msg = val === false ? '"' + key + '" has been turned off'
        : 'Now "' + key + (val === true ? '" is on' : '" use ' + JSON.stringify(val));
      return HUD.tip_(msg, 1000);
    },
    /* kFgCmd.insertMode: */ function (_0: number, opt: CmdOptions[kFgCmd.insertMode]): void {
      let { code, stat } = opt;
      InsertMode.global_ = opt;
      if (opt.hud) { return HUD.show_(`Insert mode${code ? `: ${code}/${stat}` : ""}`); }
    },
    /* kFgCmd.passNextKey: */ function (count0: number, options: CmdOptions[kFgCmd.passNextKey]): void {
      let keyCount = 0, count = Math.abs(count0);
      if (!!options.normal === (count0 > 0)) {
        esc(HandlerResult.ExitPassMode); // singleton
        if (!passKeys) {
          return HUD.tip_("No pass keys.");
        }
        const oldEsc = esc, oldPassKeys = passKeys;
        passKeys = null;
        esc = function (i: HandlerResult): HandlerResult {
          if (i === HandlerResult.Prevent && 0 >= --count || i === HandlerResult.ExitPassMode) {
            HUD.hide_();
            passKeys = oldPassKeys;
            return (esc = oldEsc)(HandlerResult.Prevent);
          }
          currentKeys = ""; nextKeys = keyMap;
          if (keyCount - count || !HUD.text_) {
            keyCount = count;
            HUD.show_("Normal mode (pass keys disabled)" + (count > 1 ? `: ${count} times` : ""));
          }
          return i;
        } as EscF;
        esc(HandlerResult.Nothing);
        return;
      }
      const keys = safer<BOOL>(null);
      VKey.pushHandler_(function (event) {
        keyCount += +!keys[event.keyCode];
        keys[event.keyCode] = 1;
        return HandlerResult.PassKey;
      }, keys);
      onKeyup2 = function (event): void {
        if (keyCount === 0 || --keyCount || --count) {
          keys[event.keyCode] = 0;
          HUD.show_(`Pass next ${count > 1 ? count + " keys." : "key."}`);
        } else {
          (exitPassMode as NonNullable<typeof exitPassMode>)();
        }
      };
      exitPassMode = function (): void {
        exitPassMode = onKeyup2 = null;
        VKey.removeHandler_(keys);
        HUD.hide_();
      };
      onKeyup2({keyCode: kKeyCode.None});
    },
    /* kFgCmd.goNext: */ function (_0: number, {r: rel, p: patterns, l, m }: CmdOptions[kFgCmd.goNext]): void {
      if (!VDom.isHTML_() || Pagination.findAndFollowRel_(rel)) { return; }
      const isNext = rel === "next";
      if (patterns.length <= 0 || !Pagination.findAndFollowLink_(patterns, isNext, l, m)) {
        return HUD.tip_("No links to go " + rel);
      }
    },
    /* kFgCmd.reload: */ function (_0: number, options: CmdOptions[kFgCmd.reload]): void {
      setTimeout(function () {
        options.url ? (location.href = options.url) : location.reload(!!(options.hard || options.force));
      }, 17);
    },
    /* kFgCmd.switchFocus: */ function (_0: number, options: CmdOptions[kFgCmd.switchFocus]): void {
      let newEl = InsertMode.lock_;
      if (newEl) {
        if ((options.act || options.action) === "backspace") {
          if (VDom.view_(newEl)) { document.execCommand("delete"); }
        } else {
          InsertMode.last_ = newEl;
          InsertMode.mutable_ = false;
          newEl.blur();
        }
        return;
      }
      newEl = InsertMode.last_;
      if (!newEl) {
        return HUD.tip_("Nothing was focused", 1200);
      }
      if (!VDom.view_(newEl) && VDom.NotVisible_(newEl)) {
        return HUD.tip_("The last focused is hidden", 2000);
      }
      InsertMode.last_ = null;
      InsertMode.mutable_ = true;
      VDom.getZoom_(newEl);
      VDom.prepareCrop_();
      return VDom.UI.simulateSelect_(newEl, null, false, "", true);
    },
    /* kFgCmd.showHelp: */ function (msg?: number | "e"): void {
      if (msg === "e") { return; }
      let wantTop = innerWidth < 400 || innerHeight < 320;
      if (!VDom.isHTML_()) {
        if (isTop) { return; }
        wantTop = true;
      }
      post({ H: kFgReq.initHelp, w: wantTop });
    },
    /* kFgCmd.autoCopy: */ function (_0: number, options: CmdOptions[kFgCmd.autoCopy]): void {
      let str = VDom.UI.getSelectionText_(1);
      if (!str) {
        str = options.url ? location.href : document.title;
        (options.decoded || options.decode) && (str = VHints.decodeURL_(str));
        if (str.endsWith(" ") && options.url) {
          str = str.slice(0, -1) + "%20";
        }
      }
      if (str.length < 4 && !str.trim() && str[0] === " ") {
        str = "";
      } else {
        post({
          H: kFgReq.copy,
          d: str
        });
      }
      return HUD.copied_(str);
    },
    /* kFgCmd.autoOpen: */ function (_0: number, options: CmdOptions[kFgCmd.autoOpen]): void {
      let url = VDom.UI.getSelectionText_(), keyword = (options.keyword || "") + "";
      url && VPort.evalIfOK_(url) || post({
        H: kFgReq.openUrl,
        c: !url,
        k: keyword, u: url
      });
    },
    /* kFgCmd.searchAs: */ function (_0: number, options: CmdOptions[kFgCmd.searchAs]): void {
      post({
        H: kFgReq.searchAs,
        u: location.href,
        c: options.copied,
        s: options.selected ? VDom.UI.getSelectionText_() : ""
      });
    },
    /* kFgCmd.focusInput: */ function (count: number, options: CmdOptions[kFgCmd.focusInput]): void {
      InsertMode.inputHint_ && (InsertMode.inputHint_.h = null as never);
      const arr: ViewOffset = VDom.getViewBox_();
      VDom.prepareCrop_();
      // here those editable and inside UI root are always detected, in case that a user modifies the shadow DOM
      const visibleInputs = VHints.traverse_(Build.BTypes & ~BrowserType.Firefox
            ? VHints.kEditableSelector_ + VHints.kSafeAllSelector_ : VHints.kEditableSelector_, VHints.GetEditable_
          ) as Array<Hint & { [0]: HintsNS.InputHintItem["dest_"]; }>,
      action = options.select;
      let sel = visibleInputs.length;
      if (sel === 0) {
        InsertMode.exitInputHint_();
        return HUD.tip_("There are no inputs to focus.", 1000);
      } else if (sel === 1) {
        InsertMode.exitInputHint_();
        return VDom.UI.simulateSelect_(visibleInputs[0][0], visibleInputs[0][1], true, action, true);
      }
      for (let ind = 0; ind < sel; ind++) {
        const hint = visibleInputs[ind], j = hint[0].tabIndex;
        hint[2] = j > 0 ? ind / 8192 - j : ind;
      }
      const hints: HintsNS.InputHintItem[] = visibleInputs.sort((a, b) => a[2] - b[2]).map(
          function (link): HintsNS.InputHintItem {
        const marker = VDom.createElement_("span") as HintsNS.BaseHintItem["marker_"],
        rect = VDom.padClientRect_(VDom.getBoundingClientRect_(link[0]), 3);
        rect[0]--, rect[1]--, rect[2]--, rect[3]--;
        marker.className = "IH";
        VDom.setBoundary_(marker.style, rect);
        return {marker_: marker, dest_: link[0]};
      });
      if (count === 1 && InsertMode.last_) {
        sel = Math.max(0, visibleInputs.map(link => link[0]).indexOf(InsertMode.last_));
      } else {
        sel = count > 0 ? Math.min(count, sel) - 1 : Math.max(0, sel + count);
      }
      hints[sel].marker_.className = "IH IHS";
      VDom.UI.simulateSelect_(visibleInputs[sel][0], visibleInputs[sel][1], false, action, false);
      VDom.UI.ensureBorder_(VDom.wdZoom_);
      const box = VDom.UI.addElementList_<false>(hints, arr), keep = !!options.keep, pass = !!options.passExitKey;
      // delay exiting the old to avoid some layout actions
      // although old elements can not be GC-ed before this line, it has little influence
      InsertMode.exitInputHint_();
      InsertMode.inputHint_ = { b: box, h: hints };
      VKey.pushHandler_(function (event) {
        const { keyCode } = event;
        if (keyCode === kKeyCode.tab) {
          const hints2 = this.h, oldSel = sel, len = hints2.length;
          sel = (oldSel + (event.shiftKey ? len - 1 : 1)) % len;
          InsertMode.hinting_ = true;
          VKey.prevent_(event); // in case that selecting is too slow
          VDom.UI.simulateSelect_(hints2[sel].dest_, null, false, action);
          hints2[oldSel].marker_.className = "IH";
          hints2[sel].marker_.className = "IH IHS";
          InsertMode.hinting_ = false;
          return HandlerResult.Prevent;
        }
        let keyStat: KeyStat;
        if (keyCode === kKeyCode.shiftKey || keep && (keyCode === kKeyCode.altKey
            || keyCode === kKeyCode.ctrlKey || keyCode === kKeyCode.metaKey)) { /* empty */ }
        else if (event.repeat) { return HandlerResult.Nothing; }
        else if (keep ? isEscape(event) || (
            keyCode === kKeyCode.enter && (keyStat = VKey.getKeyStat_(event),
              keyStat !== KeyStat.shiftKey
              && (keyStat !== KeyStat.plain || this.h[sel].dest_.localName === "input" ))
          ) : keyCode !== kKeyCode.ime && keyCode !== kKeyCode.f12
        ) {
          InsertMode.exitInputHint_();
          return !isEscape(event) ? HandlerResult.Nothing : keep || !InsertMode.lock_ ? HandlerResult.Prevent
            : pass ? HandlerResult.PassKey : HandlerResult.Nothing;
        }
        return HandlerResult.Nothing;
      }, InsertMode.inputHint_);
    }
  ],

  InsertMode = {
    grabBackFocus_: VDom.docNotCompleteWhenVimiumIniting_ as boolean | (
        (event: Event, target: LockableElement) => void),
    global_: null as CmdOptions[kFgCmd.insertMode] | null,
    hinting_: false,
    inputHint_: null as { /** box */ b: HTMLDivElement, /** hints */ h: HintsNS.InputHintItem[] } | null,
    suppressType_: null as string | null,
    last_: null as LockableElement | null,
    lock_: null as LockableElement | null,
    mutable_: true,
    init_ (): void {
      /** if `notBody` then `activeEl` is not null */
      let activeEl = document.activeElement as Element, notBody = activeEl !== document.body;
      KeydownEvents = safer(null);
      if (VDom.cache_.g && InsertMode.grabBackFocus_) {
        let counter = 0, prompt = function (): void {
          counter++ || console.log("An auto-focusing action is blocked by Vimium C.");
        };
        if (notBody) {
          InsertMode.last_ = null;
          prompt();
          (Build.BTypes & ~BrowserType.Firefox ? typeof activeEl.blur === "function" : activeEl.blur) &&
          (activeEl as HTMLElement | SVGElement).blur();
          notBody = (activeEl = document.activeElement as Element) !== document.body;
        }
        if (!notBody) {
          InsertMode.grabBackFocus_ = function (event: Event, target: LockableElement): void {
            const activeEl1 = document.activeElement;
            if (activeEl1 === target || activeEl1 && VDom.GetShadowRoot_(activeEl1)) {
              VKey.Stop_(event);
              prompt();
              target.blur();
            }
          };
          VKey.pushHandler_(InsertMode.ExitGrab_, InsertMode);
          addEventListener("mousedown", InsertMode.ExitGrab_, true);
          return;
        }
      }
      InsertMode.grabBackFocus_ = false;
      if (notBody && VDom.getEditableType_<1>(activeEl)) {
        InsertMode.lock_ = activeEl;
      }
    },
    ExitGrab_: function (this: void, event?: Req.fg<kFgReq.exitGrab> | MouseEvent | KeyboardEvent
        ): HandlerResult.Nothing | void {
      if (!InsertMode.grabBackFocus_) { return /* safer */ HandlerResult.Nothing; }
      InsertMode.grabBackFocus_ = false;
      removeEventListener("mousedown", InsertMode.ExitGrab_, true);
      VKey.removeHandler_(InsertMode);
      // it's acceptable to not set the userActed flag if there's only the top frame;
      // when an iframe gets clicked, the events are mousedown and then focus, so SafePost_ is needed
      !(event instanceof Event) || !frames.length && isTop ||
      vPort.SafePost_({ H: kFgReq.exitGrab });
      return HandlerResult.Nothing;
    } as {
      (this: void, event: KeyboardEvent): HandlerResult.Nothing;
      (this: void, request: Req.bg<kBgReq.exitGrab>): void;
      (this: void, event?: MouseEvent): void;
    },
    isActive_ (): boolean {
      if (InsertMode.suppressType_) { return false; }
      let el: Element | null = InsertMode.lock_;
      if (el !== null || InsertMode.global_) {
        return true;
      }
      el = document.activeElement;
      if (el && (el as HTMLElement).isContentEditable === true) {
        InsertMode.lock_ = el as LockableElement;
        return true;
      } else {
        return false;
      }
    },
    /** should only be called during keydown events */
    focusUpper_ (this: void, key: kKeyCode, force: boolean, event: Parameters<typeof VKey.prevent_>[0]
        ): void | 1 {
      const parEl = VDom.frameElement_();
      if (!parEl && (!force || isTop)) { return; }
      VKey.prevent_(event); // safer
      if (parEl) {
        KeydownEvents[key] = 1;
        const parentCore = Build.BTypes & BrowserType.Firefox ? VDom.parentCore_() : parent as Window,
        a1 = parentCore && parentCore.VEvent;
        if (a1 && !a1.keydownEvents_(Build.BTypes & BrowserType.Firefox ? events.keydownEvents_() : events)) {
          ((parentCore as Exclude<typeof parentCore, 0 | void | null>).VKey as typeof VKey).suppressTail_(0);
          a1.focusAndRun_(0, 0 as never, 0 as never, 1);
        } else {
          (Build.BTypes & BrowserType.Firefox ? parent as Window : parentCore as Window).focus();
        }
      } else if (KeydownEvents[key] !== 2) { // avoid sending too many messages
        post({ H: kFgReq.nextFrame, t: Frames.NextType.parent, k: key });
        KeydownEvents[key] = 2;
      }
    },
    exit_ (event: KeyboardEvent): void {
      let target: Element | null = event.target as Element;
      if (VDom.GetShadowRoot_(target)) {
        if (target = InsertMode.lock_) {
          InsertMode.lock_ = null;
          (target as LockableElement).blur();
        }
      } else if (target === InsertMode.lock_ ? (InsertMode.lock_ = null, 1) : VDom.getEditableType_<1>(target)) {
        (target as LockableElement).blur();
      }
      if (InsertMode.global_) {
        InsertMode.lock_ = null; InsertMode.global_ = null;
        HUD.hide_();
      }
    },
    onExitSuppress_: null as ((this: void) => void) | null,
    exitInputHint_ (): void {
      let hint = InsertMode.inputHint_;
      if (!hint) { return; }
      InsertMode.inputHint_ = null;
      hint.b.remove();
      VKey.removeHandler_(hint);
    }
  },

  Pagination = {
  followLink_ (linkElement: SafeHTMLElement): boolean {
    let url = linkElement.localName === "link" && (linkElement as HTMLLinkElement).href;
    if (url) {
      Commands[kFgCmd.reload](1, { url });
    } else {
      VDom.view_(linkElement);
      // note: prepareCrop is called during UI.flash_
      VDom.UI.flash_(linkElement);
      setTimeout(function () { VDom.UI.click_(linkElement); }, 100);
    }
    return true;
  },
  GetButtons_ (this: {}, hints: SafeHTMLElement[], element: Element): void {
    let s: string | null;
    const tag = element.localName, isClickable = tag === "a" || tag && (
      tag === "button" ? !(element as HTMLButtonElement).disabled
      : VDom.clickable_.has(element) || element.getAttribute("onclick") || (
        (s = element.getAttribute("role")) ? (<RegExpI> /^(button|link)$/i).test(s)
        : (this as typeof VHints).ngEnabled_ && element.getAttribute("ng-click")));
    if (!isClickable) { return; }
    if ((s = element.getAttribute("aria-disabled")) != null && (!s || s.toLowerCase() === "true")) { return; }
    const rect = VDom.getBoundingClientRect_(element);
    if (rect.width > 2 && rect.height > 2 && getComputedStyle(element).visibility === "visible") {
      hints.push(element as SafeHTMLElement);
    }
  },
  findAndFollowLink_: !(Build.NDEBUG || GlobalConsts.MaxNumberOfNextPatterns <= 255)
      ? (console.log("Assert error: GlobalConsts.MaxNumberOfNextPatterns <= 255"), 0 as never)
      : function (names: string[], isNext: boolean, lenLimit: number[], totalMax: number): boolean {
    interface Candidate { [0]: number; [1]: string; [2]: Parameters<typeof Pagination.GetButtons_>[0][number]; }
    // Note: this traverser should not need a prepareCrop
    let links = VHints.traverse_(VHints.kSafeAllSelector_, Pagination.GetButtons_, true, true);
    const count = names.length,
    quirk = isNext ? ">>" : "<<", quirkIdx = names.indexOf(quirk),
    detectQuirk = quirkIdx > 0 ? names.lastIndexOf(isNext ? ">" : "<", quirkIdx) : -1,
    refusedStr = isNext ? "<" : ">";
    links.push(document.documentElement as never as SafeHTMLElement);
    let candidates: Candidate[] = [], ch: string, s: string, maxLen = totalMax, len: number;
    for (let re1 = <RegExpOne> /\s+/, _len = links.length - 1; 0 <= --_len; ) {
      const link = links[_len];
      if (link.contains(links[_len + 1]) || (s = link.innerText).length > totalMax) { continue; }
      if (!s && !(s = (ch = (link as HTMLInputElement).value) && ch.toLowerCase && ch || link.title)) { continue; }
      if (s.length > totalMax) { continue; }
      s = s.toLowerCase();
      for (let i = 0; i < count; i++) {
        if (s.length < lenLimit[i] && s.indexOf(names[i]) !== -1) {
          if (s.indexOf(refusedStr) === -1 && (len = (s = s.trim()).split(re1).length) <= maxLen) {
            let i2 = detectQuirk - i ? names.indexOf(s, i + 1) : s.indexOf(quirk) >= 0 ? quirkIdx : -1;
            if (i2 >= 0) { i = i2; len = 2; }
            maxLen > len && (maxLen = len + 1);
            // requires GlobalConsts.MaxNumberOfNextPatterns <= 255
            candidates.push([(i << 23) | (len << 16) | (candidates.length & 0xffff), s, link]);
          }
          break;
        }
      }
    }
    if (candidates.length <= 0) { return false; }
    links = [];
    maxLen = (maxLen + 1) << 16;
    candidates = candidates.filter(a => (a[0] & 0x7fffff) < maxLen).sort((a, b) => a[0] - b[0]);
    for (let re2 = <RegExpOne> /\b/, i = candidates[0][0] >> 23; i < count; ) {
      s = names[i++];
      const re = new RegExp(re2.test(s[0]) || re2.test(s.slice(-1)) ? `\\b${s}\\b` : s, ""), j = i << 23;
      for (const cand of candidates) {
        if (cand[0] > j) { break; }
        if (re.test(cand[1])) { return Pagination.followLink_(cand[2]); }
      }
    }
    return false;
  },
  findAndFollowRel_ (relName: string): boolean {
    const elements = document.querySelectorAll("[rel]");
    let s: string | null | undefined;
    type HTMLElementWithRel = HTMLAnchorElement | HTMLAreaElement | HTMLLinkElement;
    for (let _i = 0, _len = elements.length, re1 = <RegExpOne> /\s+/; _i < _len; _i++) {
      const element = elements[_i];
      if ((<RegExpI> /^(a|area|link)$/).test(VDom.htmlTag_(element))
          && (s = (element as TypeToAssert<HTMLElement, HTMLElementWithRel, "rel">).rel)
          && s.trim().toLowerCase().split(re1).indexOf(relName) >= 0) {
        return Pagination.followLink_(element as HTMLElementWithRel as SafeHTMLElement);
      }
    }
    return false;
  }
  },
  FrameMask = {
    more_: false,
    node_: null as HTMLDivElement | null,
    timer_: 0,
    Focus_ (this: void, req: BgReq[kBgReq.focusFrame]): void {
      // Note: .c, .S are ensured to exist
      const mask = req.m, dom = VDom, doc = document;
      req.S && dom.UI.css_(req.S);
      if (mask !== FrameMaskType.NormalNext) { /* empty */ }
      else if (events.checkHidden_()
        // check <div> to detect whether no other visible elements except <frame>s in this frame
        || (Build.MinCVer < BrowserVer.MinFramesetHasNoNamedGetter && Build.BTypes & BrowserType.Chrome
                && dom.unsafeFramesetTag_  // treat a doc.body of <form> as <frameset> to simplify logic
              ? dom.notSafe_(doc.body) : dom.htmlTag_(doc.body as NonNullable<Document["body"]>) === "frameset")
            && !doc.querySelector("div")
      ) {
        post({
          H: kFgReq.nextFrame,
          k: req.k
        });
        return;
      }
      mask && setTimeout(() => events.focusAndRun_(), 1); // require FrameMaskType.NoMaskAndNoFocus is 0
      if (req.c) {
        type TypeChecked = { [key1 in FgCmdAcrossFrames]: <T2 extends FgCmdAcrossFrames>(this: void,
            count: number, options: CmdOptions[T2]) => void; };
        (Commands as TypeChecked)[req.c](req.n as number, req.a as FgOptions);
      }
      KeydownEvents[req.k] = 1;
      FrameMask.show_(mask);
    },
    show_ (mask: FrameMaskType): void {
      if (!isTop && mask === FrameMaskType.NormalNext) {
        let docEl = document.documentElement;
        if (docEl) {
        Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinScrollIntoViewOptions
          && (!(Build.BTypes & ~BrowserType.Chrome) || browserVer < BrowserVer.MinScrollIntoViewOptions)
        ?
          (Element.prototype.scrollIntoViewIfNeeded as NonNullable<Element["scrollIntoViewIfNeeded"]>).call(docEl)
        : VDom.scrollIntoView_(docEl);
        }
      }
      if (mask < FrameMaskType.minWillMask || !VDom.isHTML_()) { return; }
      let _this = FrameMask, dom1: HTMLDivElement | null;
      if (dom1 = _this.node_) {
        _this.more_ = true;
      } else {
        dom1 = VDom.createElement_("div");
        dom1.className = "R Frame" + (mask === FrameMaskType.OnlySelf ? " One" : "");
        _this.node_ = dom1;
        _this.timer_ = setInterval(_this.Remove_, isTop ? 200 : 350);
      }
      VDom.UI.add_(dom1);
    },
    Remove_ (this: void, fake?: TimerType.fake): void { // safe-interval
      const _this = FrameMask, { more_ } = _this;
      _this.more_ = false;
      if (more_ && !(Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinNo$TimerType$$Fake
                      && fake)) { return; }
      if (_this.node_) { _this.node_.remove(); _this.node_ = null; }
      clearInterval(_this.timer_);
    }
  },
  HUD = {
    _tweenId: 0,
    box_: null as HTMLDivElement | null,
    $text_: null as never as Text,
    text_: "",
    opacity_: 0 as 0 | 0.25 | 0.5 | 0.75 | 1,
    enabled_: false,
    _timer: 0,
    copied_: function (this: VHUDTy, text: string, e?: string, virtual?: true): string | void {
      if (!text) {
        if (virtual) { return text; }
        return HUD.tip_(`No ${e || "text"} found!`, 1000);
      }
      if (text.startsWith("chrome-") && text.indexOf("://") > 0) {
        // tslint:disable-next-line: ban-types
        text = (text as EnsureNonNull<String>).substring(text.indexOf("/", text.indexOf("/") + 2)) || text;
      }
      text = "Copied: " + (text.length > 41 ? text.slice(0, 41) + "\u2026" : text + ".");
      if (virtual) { return text; }
      return HUD.tip_(text, 2000);
    } as VHUDTy["copied_"],
    tip_ (text: string, duration?: number): void {
      HUD.show_(text);
      HUD.text_ && ((HUD as typeof HUD)._timer = setTimeout(HUD.hide_, duration || 1500));
    },
    show_ (text: string, embed?: boolean): void {
      const hud = HUD;
      if (!hud.enabled_ || !VDom.isHTML_()) { return; }
      hud.opacity_ = 1; hud.text_ = text;
      if (hud._timer) { clearTimeout(hud._timer); hud._timer = 0; }
      embed || hud._tweenId || (hud._tweenId = setInterval(hud._tween, 40));
      let el = hud.box_;
      if (el) {
        hud.$text_.data = text;
        if (Build.MinCVer <= BrowserVer.StyleSrc$UnsafeInline$MayNotImply$UnsafeEval
            && Build.BTypes & BrowserType.Chrome) {
          embed && (el.style.opacity = el.style.visibility = "");
          return;
        }
        embed && (el.style.cssText = "");
        return;
      }
      el = VDom.createElement_("div");
      el.className = "R HUD" + VDom.cache_.d;
      el.textContent = text;
      hud.$text_ = el.firstChild as Text;
      if (!embed) {
        const st = el.style;
        st.opacity = "0";
        st.visibility = "hidden";
        VDom.UI.box_ || VDom.UI.ensureBorder_();
      }
      VDom.UI.add_(hud.box_ = el, VHints.hints_ ? AdjustType.NotAdjust : AdjustType.DEFAULT, VHints.box_);
    },
    _tween (this: void, fake?: TimerType.fake): void { // safe-interval
      const el = HUD.box_ as HTMLDivElement, st = el.style, reduce = isEnabled && VDom.cache_.r;
      let opacity = Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinNo$TimerType$$Fake
                    && fake ? 0 : +(st.opacity || 1);
      if (opacity === HUD.opacity_) { /* empty */ }
      else if (opacity === 0) {
        HUD.$text_.data = HUD.text_;
        st.opacity = reduce ||  Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinNo$TimerType$$Fake
                      && fake ? "" : "0.25";
        st.visibility = "";
        return VDom.UI.adjust_();
      } else if (!reduce && document.hasFocus()) {
        opacity += opacity < HUD.opacity_ ? 0.25 : -0.25;
      } else {
        opacity = HUD.opacity_;
      }
      st.opacity = opacity < 1 ? "" + opacity : "";
      if (opacity !== HUD.opacity_) { return; }
      if (opacity === 0) {
        st.visibility = "hidden";
        HUD.$text_.data = "";
      }
      clearInterval(HUD._tweenId);
      HUD._tweenId = 0;
    },
    hide_ (this: void, info?: TimerType): void {
      let i: number;
      if (i = HUD._timer) { clearTimeout(i); HUD._timer = 0; }
      HUD.opacity_ = 0; HUD.text_ = "";
      if (!HUD.box_) { /* empty */ }
      else if (info === TimerType.noTimer || !isEnabled) {
        const box = HUD.box_, st = box.style;
        st.opacity = "0";
        st.visibility = "hidden";
        HUD.$text_.data = "";
      }
      else if (!HUD._tweenId && VHud) {
        HUD._tweenId = setInterval(HUD._tween, 40);
      }
    }
  },
  requestHandlers: { [K in keyof BgReq]: (this: void, request: BgReq[K]) => void } = [
    /* kBgReq.init: */ function (request: BgReq[kBgReq.init]): void {
      const r = requestHandlers, {c: load, s: flags} = request, D = VDom;
      if (Build.BTypes & BrowserType.Chrome) {
        browserVer = load.v as NonNullable<typeof load.v>;
      }
      if (<number> Build.BTypes !== BrowserType.Chrome && <number> Build.BTypes !== BrowserType.Firefox
          && <number> Build.BTypes !== BrowserType.Edge) {
        OnOther = load.b as NonNullable<typeof load.b>;
      }
      D.cache_ = load as EnsureItemsNonNull<typeof load>;
      load.m && (VKey.correctionMap_ = safer<string>(null));
      if (Build.BTypes & BrowserType.Chrome
          && (Build.BTypes & ~BrowserType.Chrome || Build.MinCVer < BrowserVer.MinDevicePixelRatioImplyZoomOfDocEl)) {
        D.specialZoom_ = (!(Build.BTypes & ~BrowserType.Chrome) || OnOther === BrowserType.Chrome)
          && (Build.MinCVer >= BrowserVer.MinDevicePixelRatioImplyZoomOfDocEl
              || browserVer >= BrowserVer.MinDevicePixelRatioImplyZoomOfDocEl);
      }
      if (Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinFramesetHasNoNamedGetter
          && browserVer < BrowserVer.MinFramesetHasNoNamedGetter) {
        VHints.kSafeAllSelector_ += ":not(" + (D.unsafeFramesetTag_ = "frameset") + ")";
      }
      if (Build.BTypes & ~BrowserType.Firefox && Build.BTypes & BrowserType.Firefox
          && OnOther === BrowserType.Firefox) {
        D.notSafe_ = (_el): _el is HTMLFormElement => false;
      }
      r[kBgReq.keyMap](request);
      if (flags) {
        InsertMode.grabBackFocus_ = InsertMode.grabBackFocus_ && !(flags & Frames.Flags.userActed);
        isLocked = !!(flags & Frames.Flags.locked);
      }
      (r[kBgReq.reset] as (request: BgReq[kBgReq.reset], initing?: 1) => void)(request, 1);
      if (isEnabled) {
        InsertMode.init_();
        if (Build.MinCVer < BrowserVer.Min$ActivateEvent$$Path$IncludeWindowAndElementsIfListenedOnWindow
            && Build.BTypes & BrowserType.Chrome
            && browserVer >= BrowserVer.Min$ActivateEvent$$Path$IncludeWindowAndElementsIfListenedOnWindow) {
          hook(HookAction.SuppressActivateOnDocument);
        }
      } else {
        InsertMode.grabBackFocus_ = false;
        hook(HookAction.Suppress);
        events.execute_ && events.execute_(kContentCmd.SuppressClickable);
      }
      r[kBgReq.init] = null as never;
      D.OnDocLoaded_(function (): void {
        HUD.enabled_ = true;
        onWndFocus = vPort.SafePost_.bind(vPort as never, <Req.fg<kFgReq.focus>> { H: kFgReq.focus });
        needToRetryParentClickable && setTimeout(function (): void {
          const vdom = VDom,
          parentCore = vdom.allowScripts_ &&
              (Build.BTypes & BrowserType.Firefox ? vdom.parentCore_() : vdom.frameElement_() && parent as Window),
          parDom = parentCore && parentCore.VDom as typeof VDom,
          oldSet = vdom.clickable_ as any as Element[] & Set<Element>,
          set = vdom.clickable_ = parDom ? parDom.clickable_ : new (WeakSet as NonNullable<typeof WeakSet>)<Element>();
          if (!Build.NDEBUG && parDom) {
            // here assumes that `set` is not a temp array but a valid WeakSet / Set
            let count: number;
            if (Build.MinCVer >= BrowserVer.MinES6$ForOf$Map$SetAnd$Symbol || !(Build.BTypes & BrowserType.Chrome)
                || oldSet.size != null) {
              count = oldSet.size;
              oldSet.forEach(el => set.add(el));
            } else {
              count = oldSet.filter(el => set.add(el)).length;
            }
            console.log(`Vimium C: extend click: ${count ? "add " + count : "no"} local items to the parent's set.`);
          } else {
            oldSet.forEach(el => set.add(el));
          }
        }, 330);
      });
      injector && injector.$r(InjectorTask.extInited);
    },
    /* kBgReq.reset: */ function (request: BgReq[kBgReq.reset], initing?: 1): void {
      const newPassKeys = request.p, newEnabled = newPassKeys !== "", old = isEnabled;
      passKeys = newPassKeys && safer<1>(null);
      if (newPassKeys) {
        isPassKeysReverted = newPassKeys[0] === "^" && newPassKeys.length > 2;
        for (const ch of (isPassKeysReverted ? newPassKeys.slice(2) : newPassKeys).split(" ")) {
          (passKeys as SafeDict<1>)[ch] = 1;
        }
      }
      isEnabled = newEnabled;
      if (initing) {
        return;
      }
      isLocked = !!request.f;
      // if true, recover listeners on shadow roots;
      // otherwise listeners on shadow roots will be removed on next blur events
      if (newEnabled) {
        esc(HandlerResult.Nothing); // for passNextKey#normal
        old || InsertMode.init_();
        (old && !isLocked) || hook(HookAction.Install);
        // here should not return even if old - a url change may mean the fullscreen mode is changed
      } else {
        Commands[kFgCmd.reset]();
      }
      if (VDom.UI.box_) { VDom.UI.adjust_(+newEnabled ? 1 : 2); }
    },
    /* kBgReq.injectorRun: */ injector ? injector.$m : null as never,
    /* kBgReq.url: */ function<T extends keyof FgReq> (this: void, request: BgReq[kBgReq.url] & Req.fg<T>): void {
      delete (request as Req.bg<kBgReq.url>).N;
      request.u = location.href;
      post<T>(request);
    },
    /* kBgReq.msg: */ function<K extends keyof FgRes> (response: Req.res<K>): void {
      const arr = vPort._callbacks, id = response.m, handler = arr[id];
      delete arr[id];
      handler(response.r);
    },
    /* kBgReq.eval: */ function (options: BgReq[kBgReq.eval]): void { VPort.evalIfOK_(options.u); },
    /* kBgReq.settingsUpdate: */function ({ d: delta }: BgReq[kBgReq.settingsUpdate]): void {
      type Keys = keyof typeof delta;
      VKey.safer_(delta);
      const cache = VDom.cache_;
      for (const i in delta) {
        (cache as Generalized<typeof cache>)[i as Keys] = (delta as EnsureItemsNonNull<typeof delta>)[i as Keys];
        const i2 = "_" + i as Keys;
        (i2 in cache) && (VKey.safer_(cache)[i2] = undefined as never);
      }
      delta.d != null && HUD.box_ && HUD.box_.classList.toggle("D", !!delta.d);
    },
    /* kBgReq.focusFrame: */ FrameMask.Focus_,
    /* kBgReq.exitGrab: */ InsertMode.ExitGrab_ as (this: void, request: Req.bg<kBgReq.exitGrab>) => void,
    /* kBgReq.keyMap: */ function (request: BgReq[kBgReq.keyMap]): void {
      const map = keyMap = request.k, func = Build.MinCVer < BrowserVer.Min$Object$$setPrototypeOf
        && Build.BTypes & BrowserType.Chrome && browserVer < BrowserVer.Min$Object$$setPrototypeOf
        ? VKey.safer_ : Object.setPrototypeOf;
      func(map, null);
      function iter(obj: ReadonlyChildKeyMap): void {
        func(obj, null);
        for (const key in obj) {
          type ObjItem = Exclude<NonNullable<(typeof obj)[string]>, KeyAction.cmd>;
          obj[key] !== KeyAction.cmd && iter(obj[key] as ObjItem);
        }
      }
      for (const key in map) {
        const sec = map[key] as NonNullable<(typeof map)[string]>;
        sec && sec !== KeyAction.count && iter(sec);
      }
      (mappedKeys = request.m) && func(mappedKeys, null);
    },
    /* kBgReq.execute: */ function<O extends keyof CmdOptions> (request: Req.FgCmd<O>): void {
      if (request.S) { VDom.UI.css_(request.S); }
      const options: CmdOptions[O] | null = request.a;
      type Keys = keyof CmdOptions;
      type TypeToCheck = {
        [key in Keys]: (this: void, count: number, options: CmdOptions[key]) => void;
      };
      type TypeChecked = {
        [key in Keys]: <T2 extends Keys>(this: void, count: number, options: CmdOptions[T2]) => void;
      };
      (Commands as TypeToCheck as TypeChecked)[request.c](request.n
        , (options ? VKey.safer_(options) : safer(null)) as CmdOptions[O]);
    },
    /* kBgReq.createMark: */ function (request: BgReq[kBgReq.createMark]): void { VMarks.createMark_(request.n); },
    /* kBgReq.showHUD: */ function (req: Req.bg<kBgReq.showHUD>): void {
      if (req.S) {
        VDom.UI.css_(req.S);
        if (req.f) {
          VFind.css_ = req.f;
          VFind.styleIframe_ && (VFind.styleIframe_.textContent = req.f.i);
        }
      }
      // tslint:disable-next-line: no-unused-expression
      req.t ? req.c ? HUD.copied_(req.t) : HUD.tip_(req.t) : 0;
    },
    /* kBgReq.count: */ function (request: BgReq[kBgReq.count]): void {
      const n = parseInt(currentKeys, 10) || 1;
      esc(HandlerResult.Nothing);
      post({ H: kFgReq.cmd, c: request.c, n, i: request.i});
    },
    /* kBgReq.showHelpDialog: */
  function ({ h: html, a: shouldShowAdvanced, o: optionUrl, S: CSS }: Req.bg<kBgReq.showHelpDialog>): void {
    // Note: not suppress key on the top, because help dialog may need a while to render,
    // and then a keyup may occur before or after it
    if (CSS) { VDom.UI.css_(CSS); }
    const oldShowHelp = Commands[kFgCmd.showHelp], suppress = VKey.SuppressAll_;
    oldShowHelp("e");
    if (!VDom.isHTML_()) { return; }
    if (oldShowHelp !== Commands[kFgCmd.showHelp]) { return; } // an old dialog exits
    let box: SafeHTMLElement;
    if (Build.BTypes & BrowserType.Firefox
        && (!(Build.BTypes & ~BrowserType.Firefox) || OnOther === BrowserType.Firefox)) {
      // on FF66, if a page is limited by "script-src 'self'; style-src 'self'"
      //   then `<style>`s created by `.innerHTML = ...` has no effects;
      //   so need `doc.createElement('style').textContent = ...`
      box = new DOMParser().parseFromString((html as Exclude<typeof html, string>).b, "text/html"
          ).body.firstChild as SafeHTMLElement;
      box.insertBefore(VDom.UI.createStyle_((html as Exclude<typeof html, string>).h), box.firstChild);
    } else {
      box = VDom.createElement_("div");
      box.innerHTML = html as string;
      box = box.firstChild as SafeHTMLElement;
    }
    box.onclick = VKey.Stop_;
    suppress(box, "mousedown");
    suppress(box, "mouseup");
    // note: if wheel is listened, then mousewheel won't be dispatched even on Chrome 35
    suppress(box, "wheel");
    suppress(box, "contextmenu");
    if (Build.MinCVer >= BrowserVer.MinMayNoDOMActivateInClosedShadowRootPassedToFrameDocument
        || !(Build.BTypes & BrowserType.Chrome)
        || browserVer >= BrowserVer.MinMayNoDOMActivateInClosedShadowRootPassedToFrameDocument) {
      box.addEventListener(
        (!(Build.BTypes & ~BrowserType.Chrome) ? false : !(Build.BTypes & BrowserType.Chrome) ? true
          : OnOther !== BrowserType.Chrome)
        ? "click" : "DOMActivate", onActivate, true);
    }

    const closeBtn = box.querySelector("#HClose") as HTMLElement,
    optLink = box.querySelector("#OptionsPage") as HTMLAnchorElement,
    advCmd = box.querySelector("#AdvancedCommands") as HTMLElement,
    hide: (this: void, e?: Event | number | "e") => void = function (event): void {
      if (event instanceof Event) {
        VKey.prevent_(event);
      }
      optLink.onclick = closeBtn.onclick = null as never;
      let i = VDom.lastHovered_;
      i && box.contains(i) && (VDom.lastHovered_ = null);
      (i = VScroller.current_) && box.contains(i) && (VScroller.current_ = null);
      VKey.removeHandler_(box);
      box.remove();
      Commands[kFgCmd.showHelp] = oldShowHelp;
    };
    closeBtn.onclick = Commands[kFgCmd.showHelp] = hide;
    if (! location.href.startsWith(optionUrl)) {
      optLink.href = optionUrl;
      optLink.onclick = function (event) {
        post({ H: kFgReq.focusOrLaunch, u: optionUrl });
        hide(event);
      };
    } else {
      optLink.remove();
    }
    function toggleAdvanced(this: void): void {
      (advCmd.firstChild as Text).data = shouldShowAdvanced ? "Hide" : "Show";
      box.classList.toggle("HelpAdvanced");
    }
    advCmd.onclick = function (event) {
      VKey.prevent_(event);
      shouldShowAdvanced = !shouldShowAdvanced;
      toggleAdvanced();
      post({
        H: kFgReq.setSetting,
        k: 0,
        v: shouldShowAdvanced
      });
    };
    shouldShowAdvanced && toggleAdvanced();
    VDom.UI.ensureBorder_();
    VDom.UI.add_(box, AdjustType.Normal, true);
    document.hasFocus() || events.focusAndRun_();
    // on FF66, `scrollIntoView` does not set tab-navigation node
    // tslint:disable-next-line: no-unused-expression
    !(Build.BTypes & BrowserType.Chrome) ? 0
      : Build.MinCVer >= BrowserVer.MinScrollIntoViewOptions
      ? VDom.scrollIntoView_(box) : VFind.fixTabNav_(box);
    VScroller.current_ = box;
    VKey.pushHandler_(function (event) {
      if (!InsertMode.lock_ && isEscape(event)) {
        VDom.UI.removeSelection_(VDom.UI.UI) || hide();
        return HandlerResult.Prevent;
      }
      return HandlerResult.Nothing;
    }, box);
    if (VOmni.status_ >= VomnibarNS.Status.Showing) {
      VKey.removeHandler_(VOmni);
      VKey.pushHandler_(VOmni.onKeydown_, VOmni);
    }
    setTimeout((): void => box.focus(), 17); // since MinElement$Focus$MayMakeArrowKeySelectIt; also work on Firefox
  }
  ],

  safeDestroy: VEventModeTy["destroy_"] = function (this: void, silent): void {
    if (!esc) { return; }
    if (Build.BTypes & BrowserType.Firefox && silent === 9) {
      vPort._port = null;
      return;
    }
    isEnabled = !1;
    hook(HookAction.Destroy);

    Commands[kFgCmd.reset]();
    let ui = VDom.UI;
    events.execute_ && events.execute_(kContentCmd.Destroy);
    ui.box_ && ui.adjust_(2);

    VDom = VKey = VHints = VScroller = VOmni = VFind = VVisual = VMarks =
    VHud = VPort = VEvent = esc = null as never;

    silent || console.log("%cVimium C%c in %o has been destroyed at %o."
      , "color:red", "color:auto"
      , location.pathname.replace(<RegExpOne> /^.*(\/[^\/]+\/?)$/, "$1")
      , Date.now());

    if (vPort._port) { try { vPort._port.disconnect(); } catch {} }
    injector || (<RegExpOne> /a?/).test("");
  },

  events = VEvent = {
    lock_ (this: void): LockableElement | null { return InsertMode.lock_; },
    isCmdTriggered_: () => isCmdTriggered,
    onWndBlur_ (this: void, f): void { onWndBlur2 = f; },
    OnWndFocus_ (this: void): void { onWndFocus(); },
    checkHidden_ (this: void, cmd?: FgCmdAcrossFrames
        , count?: number, options?: OptionsWithForce): BOOL {
      if (innerHeight < 3 || innerWidth < 3) { return 1; }
      // here should not use the cache frameElement, because `getComputedStyle(frameElement).***` might break
      const curFrameElement_ = !isTop && (Build.BTypes & BrowserType.Firefox && OnOther === BrowserType.Firefox
              || !(Build.BTypes & ~BrowserType.Firefox) ? frameElement : VDom.frameElement_()),
      el = !isTop && (curFrameElement_ || document.documentElement);
      if (!el) { return 0; }
      let box = VDom.getBoundingClientRect_(el),
      par: ReturnType<typeof VDom.parentCore_> | undefined,
      parEvents: VEventModeTy | undefined,
      result: boolean | BOOL = !box.height && !box.width || getComputedStyle(el).visibility === "hidden";
      if (cmd) {
        type EnsuredOptionsTy = Exclude<typeof options, undefined>;
        // if in a forced cross-origin env (by setting doc.domain),
        // then par.self.innerHeight works, but this behavior is undocumented,
        // so here only use `par.VIh()` in case
        if ((Build.BTypes & BrowserType.Firefox ? (par = VDom.parentCore_()) : curFrameElement_)
            && (result || box.bottom <= 0
                || (Build.BTypes & BrowserType.Firefox && par !== parent
                      ? (box.top > (par as EnsureItemsNonNull<ContentWindowCore>).VIh() )
                      : box.top > (parent as Window).innerHeight))) {
          parEvents = ((Build.BTypes & BrowserType.Firefox ? par : parent) as ContentWindowCore).VEvent;
          if (parEvents
              && !parEvents.keydownEvents_(Build.BTypes & BrowserType.Firefox ? events.keydownEvents_() : events)) {
            parEvents.focusAndRun_(cmd, count as number, options as EnsuredOptionsTy, 1);
            result = 1;
          }
        }
        if (result === true) { // if there's a same-origin parent, use it instead of top
          // here not suppress current cmd, in case of malformed pages;
          // the worst result is doing something in a hidden frame,
          //   which is tolerable, since only few commands do check hidden)
          (options as EnsuredOptionsTy).$forced ? (result = 0) : post({
            H: kFgReq.gotoMainFrame, f: 1,
            c: cmd,
            n: count as number, a: options as EnsuredOptionsTy
          });
        }
      }
      return +result as BOOL;
    },
    focusAndRun_ (this: void, cmd?: FgCmdAcrossFrames, count?: number, options?: FgOptions
        , showBorder?: 1): void {
      InsertMode.ExitGrab_();
      let old = onWndFocus, failed = true;
      onWndFocus = function (): void { failed = false; };
      if (!(Build.BTypes & BrowserType.Firefox)
          || (Build.BTypes & ~BrowserType.Firefox && OnOther !== BrowserType.Firefox)) {
        /* empty */
      } else if (VOmni.status_ === VomnibarNS.Status.Showing) {
        VOmni.box_.blur();
      } else {
        // cur is safe because on Firefox
        let cur: SafeElement | null = document.activeElement as SaferType<Document["activeElement"]>;
        cur && (<RegExpOne> /^i?frame$/).test(cur.localName) && cur.blur &&
        (cur as HTMLFrameElement | HTMLIFrameElement).blur();
      }
      focus();
      /** Maybe a `document.open()` has been called
       * Step 8 of https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#document-open-steps
       * https://cs.chromium.org/chromium/src/third_party/blink/renderer/core/dom/document.cc?q=Document::open&l=3107
       */
      failed && isEnabled && hook(HookAction.Install);
      // the line below is always necessary: see https://github.com/philc/vimium/issues/2551#issuecomment-316113725
      (onWndFocus = old)();
      if (esc) {
        esc(HandlerResult.Nothing);
        if (cmd) {
          type TypeChecked = { [key in FgCmdAcrossFrames]: <T2 extends FgCmdAcrossFrames>(this: void,
              count: number, options: CmdOptions[T2]) => void; };
          (Commands as TypeChecked)[cmd](count as number, options as FgOptions);
        }
        showBorder && FrameMask.show_(FrameMaskType.ForcedSelf);
      }
    },
    mapKey_: mapKey,
    scroll_ (this: void, event, wnd): void {
      if (!event || event.shiftKey || event.altKey) { return; }
      const { keyCode } = event as { keyCode: number }, c = (keyCode & 1) as BOOL;
      if (!(keyCode > kKeyCode.maxNotPageUp && keyCode < kKeyCode.minNotDown)) { return; }
      wnd && VDom.cache_.S && events.OnScrolls_[1](wnd, 1);
      const work = keyCode > kKeyCode.maxNotLeft ? 1 : keyCode > kKeyCode.maxNotEnd ? 2
        : !(event.ctrlKey || event.metaKey) ? 3 : 0,
      Sc = VScroller;
      work && event instanceof Event && VKey.prevent_(event as Event);
      if (work === 1) {
        Sc.scroll_((1 - c) as BOOL, keyCode < kKeyCode.minNotUp ? -1 : 1, 0);
      } else if (work === 2) {
        Sc.scroll_(1, 0, 1, 0, c > 0);
      } else if (work) {
        Sc.scroll_(1, 0.5 - c, 0, 2);
      }
    },
    OnScrolls_: [function (event): boolean {
      let repeat = Build.MinCVer < BrowserVer.Min$KeyboardEvent$$Repeat$ExistsButNotWork
          && Build.BTypes & BrowserType.Chrome ? !!event.repeat : event.repeat;
      repeat && VKey.prevent_(event);
      VScroller.scrollTick_(repeat);
      return repeat;
    }, function (this: VEventModeTy["OnScrolls_"], wnd, isAdd): void {
      const f = isAdd ? addEventListener : removeEventListener,
      listener = this[2];
      VScroller.scrollTick_(isAdd);
      f.call(wnd, "keyup", listener, true); f.call(wnd, "blur", listener, true);
    }, function (event): void {
      if (Build.MinCVer >= BrowserVer.Min$Event$$IsTrusted || !(Build.BTypes & BrowserType.Chrome)
          ? !event.isTrusted : event.isTrusted === false) {
        if (event.type !== "blur") {
          VKey.prevent_(event);
        } else if (event.target !== this) {
          return;
        }
        (events as VEventModeTy).OnScrolls_[1](this, 0);
      }
    }],
    setupSuppress_ (this: void, onExit?: (this: void) => void): void {
      const mode = InsertMode, f = mode.onExitSuppress_;
      mode.onExitSuppress_ = mode.suppressType_ = null;
      if (onExit) {
        mode.suppressType_ = getSelection().type;
        mode.onExitSuppress_ = onExit;
      }
      if (f) { return f(); }
    },
    execute_: null as VEventModeTy["execute_"],
    destroy_: safeDestroy,
    keydownEvents_: function (this: void, arr?: Pick<VEventModeTy, "keydownEvents_"> | KeydownCacheArray
        ): KeydownCacheArray | boolean {
      if (!arr) { return KeydownEvents; }
      return !isEnabled || !(KeydownEvents = Build.BTypes & BrowserType.Firefox ? arr as KeydownCacheArray
          : (arr as VEventModeTy).keydownEvents_());
    } as VEventModeTy["keydownEvents_"]
  },

  vPort = {
    _port: null as Port | null,
    _callbacks: safer(null) as { [msgId: number]: <K extends keyof FgRes>(this: void, res: FgRes[K]) => void },
    _id: 1,
    SafePost_<K extends keyof FgReq> (this: void, request: FgReq[K] & Req.baseFg<K>): void {
      try {
        if (!vPort._port) {
          vPort.Connect_();
          injector && setTimeout(vPort.TestAlive_, 50);
        } else if (Build.BTypes & BrowserType.Firefox && injector) {
          injector.$r(InjectorTask.recheckLiving);
        }
        (vPort._port as Port).postMessage(request);
      } catch { // this extension is reloaded or disabled
        safeDestroy();
      }
    },
    Listener_<T extends keyof BgReq> (this: void, response: Req.bg<T>): void {
      type TypeToCheck = { [K in keyof BgReq]: (this: void, request: BgReq[K]) => void };
      type TypeChecked = { [K in keyof BgReq]: <T2 extends keyof BgReq>(this: void, request: BgReq[T2]) => void };
      (requestHandlers as TypeToCheck as TypeChecked)[response.N](response);
    },
    TestAlive_ (): void { vPort._port || safeDestroy(); },
    ClearPort_ (this: void): void {
      vPort._port = null;
      setTimeout(function (i): void {
        if (!(Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinNo$TimerType$$Fake && i)) {
          try { vPort._port || !esc || vPort.Connect_(); return; } catch {}
        }
        safeDestroy();
      }, requestHandlers[kBgReq.init] ? 2000 : 5000);
    },
    Connect_: (function (this: void): void {
      const runtime: typeof chrome.runtime = (Build.BTypes & ~BrowserType.Chrome && OnOther !== BrowserType.Chrome
        ? browser as typeof chrome : chrome).runtime,
      status = requestHandlers[0] ? PortType.initing
        : (isEnabled ? passKeys ? PortType.knownPartial : PortType.knownEnabled : PortType.knownDisabled)
        + (isLocked ? PortType.isLocked : 0) + (VDom.UI.styleIn_ ? PortType.hasCSS : 0),
      name = PortNameEnum.Prefix + (
        PortType.isTop * +isTop + PortType.hasFocus * +document.hasFocus() + status),
      data = { name: injector ? name + injector.$h : name },
      port = vPort._port = injector ? runtime.connect(injector.id, data) as Port
        : runtime.connect(data) as Port;
      port.onDisconnect.addListener(vPort.ClearPort_);
      port.onMessage.addListener(vPort.Listener_);
    })
  };

  if (injector) {
    injector.$p = [vPort.SafePost_, function () {
      let keys = currentKeys; esc(HandlerResult.Nothing); return keys;
    }];
  }

  VPort = {
    post_: post,
    send_ <K extends keyof FgRes> (this: void, cmd: K, args: Req.fgWithRes<K>["a"]
        , callback: (this: void, res: FgRes[K]) => void): void {
      let id = ++vPort._id;
      (vPort._port as Port).postMessage({ H: kFgReq.msg, i: id, c: cmd, a: args });
      vPort._callbacks[id] = callback as <K2 extends keyof FgRes>(this: void, res: FgRes[K2]) => void;
    },
    evalIfOK_ (url: string): boolean {
      if (!VHints.jsRe_.test(url)) {
        return false;
      }
      url = url.slice(11).trim();
      if ((<RegExpOne> /^void\s*\( ?0 ?\)\s*;?$|^;?$/).test(url)) { /* empty */ }
      else if (VDom.allowScripts_) {
        setTimeout(function (): void {
          VDom.runJS_(VHints.decodeURL_(url, decodeURIComponent));
        }, 0);
      } else {
        HUD.tip_("Here's not allowed to eval scripts");
      }
      return true;
    }
  };
  VHud = HUD;
  VKey.isEscape_ = isEscape;
  if (Build.BTypes & ~BrowserType.Chrome && Build.BTypes & ~BrowserType.Firefox && Build.BTypes & ~BrowserType.Edge) {
    (window as Writable<Window>).VOther = OnOther;
  }
  if (!(Build.BTypes & BrowserType.Firefox)) { /* empty */ }
  else if (Build.BTypes & ~BrowserType.Firefox && OnOther !== BrowserType.Firefox || injector !== void 0) {
    VDom.getWndCore_ = wnd => wnd;
  } else {
    coreTester = {
      name_: BuildStr.CoreGetterFuncName as const,
      rand_: 0,
      recvTick_: 0,
      sendTick_: 0,
      encrypt_ (trustedRand: number, unsafeRand: number): string {
        trustedRand += (unsafeRand >= 0 && unsafeRand < 1 ? unsafeRand : trustedRand);
        let a = (0x8000 * trustedRand) | 0,
        host = new URL((browser as typeof chrome).runtime.getURL("")).host.replace(<RegExpG> /-/g, "");
        return ((host + (BuildStr.RandomReq as number | string as number).toString(16)
            ).match(<RegExpG> /[\da-f]{1,4}/gi) as string[]
            ).map((i, ind) => parseInt(i, 16) & (ind & 1 ? ~a : a)).join("");
      },
      compare_ (rand2: number, testEncrypted: string): boolean {
        const diff = coreTester.encrypt_(coreTester.rand_, +rand2) !== testEncrypted, d2 = coreTester.recvTick_ > 64;
        coreTester.recvTick_ += d2 ? 0 : diff ? 2 : 1;
        return diff || d2; // hide the real result if too many errors
      }
    };
    /** Note: this function needs to be safe enough */
    VDom.getWndCore_ = function (anotherWnd: Window): ContentWindowCore | 0 | void {
      coreTester.recvTick_ = -1;
      try {
        let core: ReturnType<SandboxGetterFunc>,
        getter = anotherWnd.wrappedJSObject[coreTester.name_];
        return getter && (core = getter(coreTester.compare_, coreTester.rand_ = Math.random())) &&
          !coreTester.recvTick_ ? core : 0;
      } catch {}
    };
    // on Firefox, such a exported function can only be called from privildged environments
    wrappedJSObject[coreTester.name_] = function (comparer, rand1) {
      let rand2 = Math.random();
      // an ES6 method function is always using the strict mode, so the arguments are inaccessible outside it
      if (coreTester.sendTick_ > GlobalConsts.MaxRetryTimesForSecret
          || esc.toString.call(comparer) !== coreTester.compare_ + ""
          || comparer(rand2, coreTester.encrypt_(rand2, +rand1))) {
        if (coreTester.sendTick_ <= GlobalConsts.MaxRetryTimesForSecret) {
          coreTester.sendTick_++;
        }
        return;
      }
      if (!thisCore) {
        // not expose VPort, in case of unpredictable attacks
        /** @see {@link base.d.ts#ContentWindowCore} */
        thisCore = { VDom, VKey, VHints, VScroller, VOmni, VFind, VEvent, VIh: () => innerHeight };
      }
      return thisCore;
    };
  }

  isTop || injector ||
  function (): void { // if injected, `parentFrame_` still needs a value
    const parEl = VDom.frameElement_();
    if (!parEl) {
      if ((Build.MinCVer >= BrowserVer.MinEnsuredES6WeakMapAndWeakSet || !(Build.BTypes & BrowserType.Chrome)
          || WeakSet) && VDom.docNotCompleteWhenVimiumIniting_) {
        needToRetryParentClickable = 1;
        if (Build.MinCVer >= BrowserVer.MinES6$ForOf$Map$SetAnd$Symbol || !(Build.BTypes & BrowserType.Chrome)
            || Set) {
          VDom.clickable_ = new (Set as NonNullable<typeof Set>)<Element>();
        } else {
          let arr: Element[] & NonNullable<typeof VDom.clickable_> = [] as any;
          VDom.clickable_ = arr;
          arr.add = arr.push;
          // a temp collection, so it's okay just to ignore its elements
          arr.has = Build.MinCVer >= BrowserVer.MinEnsured$Array$$Includes || !(Build.BTypes & BrowserType.Chrome)
              ? (arr.includes as NonNullable<typeof arr.includes>) : () => !1;
        }
      }
      return;
    }
    type FindTy = typeof VFind;
    if (Build.BTypes & BrowserType.Firefox) {
      let core = Build.BTypes & ~BrowserType.Firefox && OnOther !== BrowserType.Firefox
          ? parent as Window // know it's in another extension's page, or not on Firefox
          : VDom.parentCore_();
      try { // `core` is still unsafe
        const vfind = (core && core.VFind) as FindTy | undefined;
        if (vfind) {
          if (vfind && (!(Build.BTypes & ~BrowserType.Firefox) || OnOther === BrowserType.Firefox
                        ? XPCNativeWrapper(vfind) : vfind).box_ === parEl) {
            safeDestroy(1);
            vfind.onLoad_();
          } else {
            VDom.clickable_ = ((core as Exclude<NonNullable<typeof core>, 0>).VDom as typeof VDom).clickable_;
          }
          return;
        }
      } catch (e) {
        if (!Build.NDEBUG) {
          console.log("Assert error: Parent frame check breaks:", e);
        }
      }
      if ((!(Build.BTypes & ~BrowserType.Firefox) || OnOther === BrowserType.Firefox)
          && VDom.docNotCompleteWhenVimiumIniting_) {
        // here the parent `core` is invalid - maybe from a fake provider
        VDom.parentCore_ = () => 0;
      }
    } else {
      // if not `vfind`, then a parent may have destroyed for unknown reasons
      const vfind = (parent as Window).VFind as FindTy | undefined;
      if (vfind && vfind.box_ === parEl) {
        safeDestroy(1);
        vfind.onLoad_();
      } else {
        VDom.clickable_ = vfind as object | null as never && ((parent as Window).VDom as typeof VDom).clickable_;
      }
    }
  }();
  if (esc) {
    VDom.clickable_ = !(Build.BTypes & BrowserType.Firefox)
        || Build.BTypes & ~BrowserType.Firefox && OnOther !== BrowserType.Firefox
        ? VDom.clickable_ ||
        ( Build.MinCVer >= BrowserVer.MinEnsuredES6WeakMapAndWeakSet || !(Build.BTypes & BrowserType.Chrome)
            || WeakSet ? new (WeakSet as WeakSetConstructor)<Element>() as never : {
      add (element: Element): any { (element as ElementWithClickable).vimiumClick = true; },
      has (element: Element): boolean { return !!(element as ElementWithClickable).vimiumClick; }
    }) : /* now know it's on Firefox */
        VDom.clickable_ || new (WeakSet as WeakSetConstructor)<Element>();
    // here we call it before vPort.connect, so that the code works well even if runtime.connect is sync
    hook(HookAction.Install);
    vPort.Connect_();
  }
})();

if (Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinSafe$String$$StartsWith && !"".startsWith) {
  String.prototype.startsWith = function (this: string, s: string): boolean {
    return this.length >= s.length && this.lastIndexOf(s, 0) === 0;
  };
  String.prototype.endsWith = function (this: string, s: string): boolean {
    const i = this.length - s.length;
    return i >= 0 && this.indexOf(s, i) === i;
  };
}
