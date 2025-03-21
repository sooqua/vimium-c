const enum ClickType {
  Default = 0, edit,
  MaxNotWeak = edit, attrListener, MinWeak = attrListener, codeListener, classname, tabindex, MaxWeak = tabindex,
  MinNotWeak, // should <= MaxNotBox
  MaxNotBox = 6, frame, scrollX, scrollY,
}
const enum DeepQueryType {
  NotDeep = 0, // must be 0 because of `InDeep - deep`
  NotAvailable = 1,
  InDeep = 2,
}
declare namespace HintsNS {
  type LinkEl = Hint[0];
  interface Executor {
    // tslint:disable-next-line: callable-types
    (linkEl: LinkEl, rect: Rect | null, hintEl: Pick<HintsNS.HintItem, "refer_">): void | boolean;
  }
  interface ModeOpt extends ReadonlyArray<Executor | HintMode | string> {
    [0]: Executor;
    [1]: HintMode;
    [2]: string;
  }
  interface Options extends SafeObject {
    action?: string;
    mode?: string | number;
    url?: boolean;
    keyword?: string;
    newtab?: boolean;
    button?: "right";
    touch?: boolean | null;
    toggle?: {
      [selector: string]: string;
    };
    mapKey?: boolean;
    auto?: boolean;
    /** @deprecated */
    force?: boolean;
  }
  type NestedFrame = false | 0 | null | HTMLIFrameElement | HTMLFrameElement;
  interface Filter<T> {
    // tslint:disable-next-line: callable-types
    (this: {}, hints: T[], element: SafeHTMLElement): void;
  }
  type LinksMatched = false | null | HintItem[];
  type Stack = number[];
  type Stacks = Stack[];
  interface KeyStatus {
    known_: BOOL;
    newHintLength_: number;
    tab_: BOOL;
  }
  type HintSources = SafeElement[] | NodeListOf<SafeElement>;
}

var VHints = {
  CONST_: {
    focus: HintMode.FOCUS,
    hover: HintMode.HOVER,
    input: HintMode.FOCUS_EDITABLE,
    leave: HintMode.LEAVE,
    unhover: HintMode.LEAVE,
    text: HintMode.COPY_TEXT,
    "copy-text": HintMode.COPY_TEXT,
    url: HintMode.COPY_URL,
    image: HintMode.OPEN_IMAGE
  } as Dict<HintMode>,
  box_: null as HTMLDivElement | HTMLDialogElement | null,
  dialogMode_: false,
  hints_: null as HintsNS.HintItem[] | null,
  mode_: 0 as HintMode,
  mode1_: 0 as HintMode,
  modeOpt_: null as never as HintsNS.ModeOpt,
  forHover_: false,
  count_: 0,
  lastMode_: 0 as HintMode,
  tooHigh_: false as null | boolean,
  pTimer_: 0, // promptTimer
  isClickListened_: true,
  ngEnabled_: null as boolean | null,
  jsaEnabled_: null as boolean | null,
  keyStatus_: {
    known_: 0,
    newHintLength_: 0,
    tab_: 0
  } as HintsNS.KeyStatus,
  doesMapKey_: false,
  keyCode_: kKeyCode.None,
  isActive_: false,
  noHUD_: false,
  options_: null as never as HintsNS.Options,
  timer_: 0,
  yankedList_: "",
  kSafeAllSelector_: Build.BTypes & ~BrowserType.Firefox ? ":not(form)" as const : "*" as const,
  kEditableSelector_: "input,textarea,[contenteditable]" as const,
  activate_ (this: void, count: number, options: FgOptions): void {
    const a = VHints;
    if (a.isActive_) { return; }
    if (VEvent.checkHidden_(kFgCmd.linkHints, count, options)) {
      return a.clean_();
    }
    VKey.removeHandler_(a);
    if (document.body === null) {
      a.clean_();
      if (!a.timer_ && VDom.OnDocLoaded_ !== VDom.execute_) {
        VKey.pushHandler_(VKey.SuppressMost_, a);
        a.timer_ = setTimeout(a.activate_.bind(a as never, count, options), 300);
        return;
      }
      if (!VDom.isHTML_()) { return; }
    }
    a.setModeOpt_(count, options);
    let s0 = options.characters, str = s0 ? s0 + "" : VDom.cache_.l;
    if (str.length < 3) {
      a.clean_(1);
      return VHud.tip_("Characters for LinkHints are too few.", 1000);
    }
    a.alphabetHints_.chars_ = str.toUpperCase();
    a.doesMapKey_ = options.mapKey !== false;

    const arr: ViewBox = VDom.getViewBox_(1) as ViewBox;
    VDom.prepareCrop_();
    if (a.tooHigh_ !== null) {
      a.tooHigh_ = (VDom.scrollingEl_(1) as HTMLElement).scrollHeight / innerHeight
        > GlobalConsts.LinkHintTooHighThreshold;
    }
    let elements = a.getVisibleElements_(arr);
    if (a.frameNested_) {
      if (a.TryNestedFrame_(kFgCmd.linkHints, count, options)) {
        return a.clean_();
      }
    }
    if (elements.length === 0) {
      a.clean_(1);
      return VHud.tip_("No links to select.", 1000);
    }

    if (a.box_) { a.box_.remove(); a.box_ = null; }
    a.hints_ = elements.map(a.createHint_, a);
    VDom.bZoom_ !== 1 && a.adjustMarkers_(elements);
    elements = null as never;
    a.alphabetHints_.initMarkers_(a.hints_);

    a.noHUD_ = arr[3] <= 40 || arr[2] <= 320 || (options.hideHUD || options.hideHud) === true;
    VDom.UI.ensureBorder_(VDom.wdZoom_);
    a.setMode_(a.mode_, false);
    a.box_ = VDom.UI.addElementList_(a.hints_, arr, a.dialogMode_);
    a.dialogMode_ && (a.box_ as HTMLDialogElement).showModal();

    a.isActive_ = true;
    VKey.pushHandler_(a.onKeydown_, a);
    VEvent.onWndBlur_(a.ResetMode_);
  },
  setModeOpt_ (count: number, options: HintsNS.Options): void {
    const a = this;
    if (a.options_ === options) { return; }
    let modeOpt: HintsNS.ModeOpt | undefined,
    mode = (<number> options.mode > 0 ? options.mode as number
      : a.CONST_[options.action || options.mode as string] as number | undefined | {} as number) | 0;
    if (mode === HintMode.EDIT_TEXT && options.url) {
      mode = HintMode.EDIT_LINK_URL;
    }
    count = Math.abs(count);
    if (count > 1) { mode < HintMode.min_disable_queue ? (mode |= HintMode.queue) : (count = 1); }
    for (let modes of a.Modes_) {
      if (Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinEnsured$Array$$Includes
          ? modes.indexOf(mode) > 0 : (modes as ReadonlyArrayWithIncludes<(typeof modes)[number]>).includes(mode)) {
        modeOpt = modes;
        break;
      }
    }
    if (!(Build.NDEBUG || a.Modes_.length === 9)) {
      console.log("Assert error: VHints.Modes_ should have 9 items");
    }
    if (!modeOpt) {
      modeOpt = a.Modes_[8];
      mode = count > 1 ? HintMode.OPEN_WITH_QUEUE : HintMode.OPEN_IN_CURRENT_TAB;
    }
    a.modeOpt_ = modeOpt;
    a.options_ = options;
    a.count_ = count;
    return a.setMode_(mode, true);
  },
  setMode_ (mode: HintMode, slient?: boolean): void {
    const a = this;
    a.lastMode_ = a.mode_ = mode;
    a.mode1_ = mode = mode & ~HintMode.queue;
    a.forHover_ = mode > HintMode.min_hovering - 1 && mode < HintMode.max_hovering + 1;
    if (slient || a.noHUD_) { return; }
    if (a.pTimer_ < 0) {
      a.pTimer_ = setTimeout(a.SetHUDLater_, 1000);
      return;
    }
    const msg = a.dialogMode_ ? " (modal UI)" : "";
    return VHud.show_(a.modeOpt_[a.modeOpt_.indexOf(a.mode_) + 1] + msg, true);
  },
  SetHUDLater_ (this: void): void {
    const a = VHints;
    if (a && a.isActive_) { a.pTimer_ = 0; return a.setMode_(a.mode_); }
  },
  TryNestedFrame_ (cmd: FgCmdAcrossFrames, count: number, options: SafeObject): boolean {
    const a = this;
    if (a.frameNested_ !== null) {
      cmd !== kFgCmd.linkHints && VDom.prepareCrop_();
      a.checkNestedFrame_();
    }
    interface VWindow extends Window {
      VHints: typeof VHints;
    }
    let frame = a.frameNested_, err = true, done = false;
    let events: VEventModeTy | undefined, core: ContentWindowCore | null | 0 | void | undefined = null;
    if (!frame) { return false; }
    try {
      if (frame.contentDocument
          && (core = Build.BTypes & BrowserType.Firefox ? VDom.getWndCore_(frame.contentWindow) : frame.contentWindow)
          && core.VDom && (core.VDom as typeof VDom).isHTML_()) {
        if (cmd === kFgCmd.linkHints) {
          (done = (core as VWindow).VHints.isActive_) && (core as VWindow).VHints.deactivate_(0);
        }
        events = core.VEvent as VEventModeTy;
        err = events.keydownEvents_(Build.BTypes & BrowserType.Firefox ? VEvent.keydownEvents_() : VEvent);
      }
    } catch (e) {
      if (!Build.NDEBUG) {
        let notDocError = true;
        if (Build.BTypes & BrowserType.Chrome && VDom.cache_.v < BrowserVer.Min$ContentDocument$NotThrow) {
          try {
            notDocError = frame.contentDocument !== undefined;
          } catch { notDocError = false; }
        }
        if (notDocError) {
          console.log("Assert error: Child frame check breaks:", e);
        }
      }
    }
    if (err) {
      // It's cross-site, or Vimium C on the child is wholly disabled
      // * Cross-site: it's in an abnormal situation, so we needn't focus the child;
      a.frameNested_ = null;
      return false;
    }
    done ? (events as NonNullable<typeof events>).focusAndRun_()
    : (events as NonNullable<typeof events>).focusAndRun_(cmd, count, options);
    if (done) { return true; }
    if (document.readyState !== "complete") { a.frameNested_ = false; }
    return true;
  },
  maxLeft_: 0,
  maxTop_: 0,
  maxRight_: 0,
  zIndexes_: null as null | false | HintsNS.Stacks,
  createHint_ (link: Hint): HintsNS.HintItem {
    let i: number = link.length < 4 ? link[1][0] : (link as Hint4)[3][0][0] + (link as Hint4)[3][1];
    const marker = VDom.createElement_("span") as HintsNS.MarkerElement, st = marker.style,
    isBox = link[2] > ClickType.MaxNotBox,
    hint: HintsNS.HintItem = {
      key_: "", dest_: link[0], marker_: marker,
      refer_: link.length > 4 ? (link as Hint5)[4] : isBox ? link[0] : null,
    };
    marker.className = isBox ? "LH BH" : "LH";
    st.left = i + "px";
    if ((Build.BTypes & ~BrowserType.Chrome || Build.MinCVer < BrowserVer.MinAbsolutePositionNotCauseScrollbar)
        && i > this.maxLeft_ && this.maxRight_) {
      st.maxWidth = this.maxRight_ - i + "px";
    }
    i = link[1][1];
    st.top = i + "px";
    if ((Build.BTypes & ~BrowserType.Chrome || Build.MinCVer < BrowserVer.MinAbsolutePositionNotCauseScrollbar)
        && i > this.maxTop_) {
      st.maxHeight = this.maxTop_ - i + GlobalConsts.MaxHeightOfLinkHintMarker + "px";
    }
    return hint;
  },
  adjustMarkers_ (elements: Hint[]): void {
    const zi = VDom.bZoom_, root = VDom.UI.UI;
    let i = elements.length - 1;
    if (!root || elements[i][0] !== VOmni.box_ && !root.querySelector("#HelpDialog")) { return; }
    const z = Build.BTypes & ~BrowserType.Firefox ? ("" + 1 / zi).slice(0, 5) : "",
    arr = this.hints_ as HintsNS.HintItem[],
    mr = Build.BTypes & ~BrowserType.Chrome || Build.MinCVer < BrowserVer.MinAbsolutePositionNotCauseScrollbar
        ? this.maxRight_ * zi : 0,
    mt = Build.BTypes & ~BrowserType.Chrome || Build.MinCVer < BrowserVer.MinAbsolutePositionNotCauseScrollbar
        ? this.maxTop_ * zi : 0;
    while (0 <= i && root.contains(elements[i][0])) {
      let st = arr[i--].marker_.style;
      Build.BTypes & ~BrowserType.Firefox && (st.zoom = z);
      if (!(Build.BTypes & ~BrowserType.Chrome) && Build.MinCVer >= BrowserVer.MinAbsolutePositionNotCauseScrollbar) {
        continue;
      }
      st.maxWidth && (st.maxWidth = mr - elements[i][1][0] + "px");
      st.maxHeight && (st.maxHeight = mt - elements[i][1][1] + 18 + "px");
    }
  },
  btnRe_: <RegExpOne> /\b(?:[Bb](?:utto|t)n|[Cc]lose)(?:$|[-\s_])/,
  roleRe_: <RegExpI> /^(?:button|checkbox|link|radio|tab)$|^menuitem/i,
  /**
   * Must ensure only call {@link scroller.ts#VScroller.shouldScroll_need_safe_} during {@link #getVisibleElements_}
   */
  GetClickable_ (hints: Hint[], element: SafeHTMLElement): void {
    let arr: Rect | null | undefined, isClickable = null as boolean | null, s: string | null
      , type = ClickType.Default, clientSize: number = 0;
    const tag = element.localName;
    switch (tag) {
    case "a":
      isClickable = true;
      arr = this.checkAnchor_(element as HTMLAnchorElement & EnsuredMountedHTMLElement);
      break;
    case "audio": case "video": isClickable = true; break;
    case "frame": case "iframe":
      if (element === VOmni.box_) {
        if (arr = VDom.getVisibleClientRect_(element)) {
          (arr as WritableRect)[0] += 12; (arr as WritableRect)[1] += 9;
          hints.push([element, arr, ClickType.frame]);
        }
        return;
      }
      isClickable = element !== VFind.box_;
      type = isClickable ? ClickType.frame : ClickType.Default;
      break;
    case "input":
      if ((element as HTMLInputElement).type === "hidden") { return; } // no break;
    case "textarea":
      // on C75, a <textarea disabled> is still focusable
      if ((element as TextElement).disabled && this.mode1_ < HintMode.max_mouse_events + 1) { return; }
      if (!(element as TextElement).readOnly || this.mode1_ > HintMode.min_job - 1
          || tag[0] === "i"
              && VDom.uneditableInputs_[(element as HTMLInputElement).type]) {
        isClickable = true;
      }
      break;
    case "details":
      isClickable = this.isNotReplacedBy_(VDom.findMainSummary_(element as HTMLDetailsElement), hints);
      break;
    case "label":
      isClickable = this.isNotReplacedBy_((element as HTMLLabelElement).control as SafeHTMLElement | null);
      break;
    case "button": case "select":
      isClickable = !(element as HTMLButtonElement | HTMLSelectElement).disabled
        || this.mode1_ > HintMode.max_mouse_events;
      break;
    case "object": case "embed":
      s = (element as HTMLObjectElement | HTMLEmbedElement).type;
      if (s && s.endsWith("x-shockwave-flash")) { isClickable = true; break; }
      if (tag !== "embed"
          && (element as HTMLObjectElement).useMap) {
        VDom.getClientRectsForAreas_(element as HTMLObjectElement, hints as Hint5[]);
      }
      return;
    case "img":
      if ((element as HTMLImageElement).useMap) {
        VDom.getClientRectsForAreas_(element as HTMLImageElement, hints as Hint5[]);
      }
      if ((this.forHover_ && VDom.htmlTag_(element.parentNode as Element) !== "a")
          || ((s = (element as HTMLElement).style.cursor as string) ? s !== "default"
              : (s = getComputedStyle(element).cursor as string) && (s.indexOf("zoom") >= 0 || s.startsWith("url"))
          )) {
        isClickable = true;
      }
      break;
    case "div": case "ul": case "pre": case "ol": case "code": case "table": case "tbody":
      clientSize = 1;
      break;
    }
    if (isClickable === null) {
      type = (s = element.contentEditable) !== "inherit" && s && s !== "false" ? ClickType.edit
        : element.getAttribute("onclick")
          || (s = element.getAttribute("role")) && this.roleRe_.test(s)
          || this.ngEnabled_ && element.getAttribute("ng-click")
          || this.forHover_ && element.getAttribute("onmouseover")
          || this.jsaEnabled_ && (s = element.getAttribute("jsaction")) && this.checkJSAction_(s)
        ? ClickType.attrListener
        : VDom.clickable_.has(element) && this.isClickListened_
          && this.inferTypeOfListener_(element, tag)
        ? ClickType.codeListener
        : (s = element.getAttribute("tabindex")) && parseInt(s, 10) >= 0 ? ClickType.tabindex
        : clientSize
          && ((clientSize = element.clientHeight) > GlobalConsts.MinScrollableAreaSizeForDetection - 1
                && clientSize + 5 < element.scrollHeight ? ClickType.scrollY
              : clientSize > /* scrollbar:12 + font:9 */ 20
                && (clientSize = element.clientWidth) > GlobalConsts.MinScrollableAreaSizeForDetection - 1
                && clientSize + 5 < element.scrollWidth ? ClickType.scrollX
              : ClickType.Default)
          || ((s = element.className) && this.btnRe_.test(s)
              || element.getAttribute("aria-selected") ? ClickType.classname : ClickType.Default);
    }
    if ((isClickable || type !== ClickType.Default)
        && (arr = arr || VDom.getVisibleClientRect_(element))
        && (type < ClickType.scrollX
          || VScroller.shouldScroll_need_safe_(element, type - ClickType.scrollX as 0 | 1) > 0)
        && ((s = element.getAttribute("aria-hidden")) == null || s && s.toLowerCase() !== "true")
        && ((s = element.getAttribute("aria-disabled")) == null || (s && s.toLowerCase() !== "true")
            || this.mode_ > HintMode.min_job - 1)
    ) { hints.push([element, arr, type]); }
  },
  GetClickableInMaybeSVG_ (hints: Hint[], element: SVGElement | Element): void {
    let arr: Rect | null | undefined, s: string | null , type = ClickType.Default;
    { // not HTML*
      // never accept raw `Element` instances, so that properties like .tabIndex and .dataset are ensured
      if ("tabIndex" in /* <ElementToHTMLorSVG> */ element) { // SVG*
        // not need to distinguish attrListener and codeListener
        type = VDom.clickable_.has(element) || element.getAttribute("onclick")
            || this.ngEnabled_ && element.getAttribute("ng-click")
            || this.jsaEnabled_ && (s = element.getAttribute("jsaction")) && this.checkJSAction_(s)
          ? ClickType.attrListener
          : element.tabIndex >= 0 ? ClickType.tabindex
          : ClickType.Default;
        if (type > ClickType.Default && (arr = VDom.getVisibleClientRect_(element))) {
          hints.push([element, arr, type]);
        }
      }
    }
  },
  noneActionRe_: <RegExpOne> /\._\b(?![\$\.])/,
  checkJSAction_ (str: string): boolean {
    for (let s of str.split(";")) {
      s = s.trim();
      const t = s.startsWith("click:") ? (s = s.slice(6)) : s && s.indexOf(":") === -1 ? s : null;
      if (t && t !== "none" && !this.noneActionRe_.test(t)) {
        return true;
      }
    }
    return false;
  },
  _HNTagRe: <RegExpOne> /h\d/,
  checkAnchor_ (anchor: HTMLAnchorElement & EnsuredMountedHTMLElement): Rect | null {
    // for Google search result pages
    let el = (anchor.rel || anchor.hasAttribute("ping"))
        && anchor.firstElementChild as Element | null;
    return el && this._HNTagRe.test(VDom.htmlTag_(el))
        && this.isNotReplacedBy_(el as HTMLHeadingElement & SafeHTMLElement) ? VDom.getVisibleClientRect_(el) : null;
  },
  isNotReplacedBy_ (element: SafeHTMLElement | null, isExpected?: Hint[]): boolean | null {
    const arr2: Hint[] = [], a = this, clickListened = a.isClickListened_;
    if (element) {
      if (!isExpected && (element as TypeToAssert<HTMLElement, HTMLInputElement, "disabled">).disabled) { return !1; }
      isExpected && (VDom.clickable_.add(element), a.isClickListened_ = true);
      a.GetClickable_(arr2, element);
      if (!clickListened && isExpected && arr2.length && arr2[0][2] === ClickType.codeListener) {
        a.isClickListened_ = clickListened;
        a.GetClickable_(arr2, element);
        if (arr2.length < 2) { // note: excluded during normal logic
          isExpected.push(arr2[0]);
        }
      }
    }
    return element ? !arr2.length : !!isExpected || null;
  },
  inferTypeOfListener_ (el: SafeHTMLElement, tag: string): boolean {
    // Note: should avoid nested calling to isNotReplacedBy_
    let el2: Element | null | undefined;
    return tag !== "div" && tag !== "li"
        ? tag === "tr" ? !!this.isNotReplacedBy_(el.querySelector("input[type=checkbox]") as SafeHTMLElement | null)
          : tag !== "table"
        : !(el2 = el.firstElementChild as Element | null) ||
          !(!el.className && !el.id && tag === "div"
            || ((tag = VDom.htmlTag_(el2)) === "div" || tag === "span") && VDom.clickable_.has(el2)
                && el2.getClientRects().length
            || this._HNTagRe.test(tag) && (el2 = (el2 as HTMLHeadingElement).firstElementChild as Element | null)
                && VDom.htmlTag_(el2) === "a"
          );
  },
  /** Note: required by {@link #kFgCmd.focusInput}, should only add SafeHTMLElement instances */
  GetEditable_ (hints: Hint[], element: SafeHTMLElement): void {
    let arr: Rect | null, s: string;
    switch (element.localName) {
    case "input":
      if (VDom.uneditableInputs_[(element as HTMLInputElement).type]) {
        return;
      } // no break;
    case "textarea":
      if ((element as TextElement).disabled || (element as TextElement).readOnly) { return; }
      break;
    default:
      if ((s = element.contentEditable) === "inherit" || s === "false" || !s) {
        return;
      }
      break;
    }
    if (arr = VDom.getVisibleClientRect_(element)) {
      hints.push([element as HintsNS.InputHintItem["dest_"], arr, ClickType.edit]);
    }
  },
  GetLinks_ (hints: Hint[], element: SafeHTMLElement): void {
    let a: string | null, arr: Rect | null;
    if (element.localName === "a" && ((a = element.getAttribute("href")) && a !== "#"
        && !this.jsRe_.test(a)
        || (element as HTMLAnchorElement).dataset.vimUrl != null)) {
      if (arr = VDom.getVisibleClientRect_(element)) {
        hints.push([element as HTMLAnchorElement, arr, ClickType.Default]);
      }
    }
  },
  GetImagesInImg_ (hints: Hint[], element: HTMLImageElement): void {
    // according to https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement#Browser_compatibility,
    // <img>.currentSrc is since C45
    if (!element.getAttribute("src") && !element.currentSrc && !element.dataset.src) { return; }
    let rect: ClientRect | undefined, cr: Rect | null = null, w: number, h: number;
    if ((w = element.width) < 8 && (h = element.height) < 8) {
      if (w !== h || (w !== 0 && w !== 3)) { return; }
      rect = element.getClientRects()[0];
      if (rect) {
        w = rect.left; h = rect.top;
        cr = VDom.cropRectToVisible_(w, h, w + 8, h + 8);
      }
    } else if (rect = element.getClientRects()[0]) {
      w = rect.right + (rect.width < 3 ? 3 : 0);
      h = rect.bottom + (rect.height < 3 ? 3 : 0);
      cr = VDom.cropRectToVisible_(rect.left, rect.top, w, h);
    }
    if (cr && getComputedStyle(element).visibility === "visible") {
      hints.push([element, cr, ClickType.Default]);
    }
  },
  GetImages_ (hints: Hint[], element: Element): void {
    const tag = element.localName;
    if (tag === "img") {
      this.GetImagesInImg_(hints, element as HTMLImageElement);
      return;
    }
    let str: string | null, cr: Rect | null;
    if (this.mode1_ === HintMode.DOWNLOAD_MEDIA && (tag === "video" || tag === "audio")) {
      str = (element as HTMLImageElement).currentSrc || (element as HTMLImageElement).src;
    } else {
      str = (element as SafeHTMLElement).dataset.src || element.getAttribute("href");
      if (!this.isImageUrl_(str)) {
        str = (element as SafeHTMLElement).style.backgroundImage as string;
        // skip "data:" URLs, becase they are not likely to be big images
        str = str && str.slice(0, 3).toLowerCase() === "url" && str.lastIndexOf("data:", 9) < 0 ? str : "";
      }
    }
    if (str) {
      if (cr = VDom.getVisibleClientRect_(element)) {
        hints.push([element as SafeHTMLElement, cr, ClickType.Default]);
      }
    }
  },
  /** @safe_even_if_any_overridden_property */
  traverse_: function (selector: string
      , filter: HintsNS.Filter<Hint | SafeHTMLElement>, notWantVUI?: boolean
      , wholeDoc?: true): Hint[] | Element[] {
    if (!Build.NDEBUG && Build.BTypes & ~BrowserType.Firefox && selector === "*") {
      selector = VHints.kSafeAllSelector_; // for easier debugging
    }
    const a = VHints, matchAll = selector === a.kSafeAllSelector_, D = document,
    output: Hint[] | SafeHTMLElement[] = [],
    d = VDom, uiRoot = d.UI.UI,
    Sc = VScroller,
    wantClickable = filter === a.GetClickable_,
    isInAnElement = !Build.NDEBUG && !!wholeDoc && (wholeDoc as {}) instanceof Element,
    box = !wholeDoc && (!(Build.BTypes & ~BrowserType.Chrome)
          || Build.MinCVer >= BrowserVer.MinEnsured$Document$$fullscreenElement
        ? D.fullscreenElement : D.webkitFullscreenElement)
        || !Build.NDEBUG && isInAnElement && wholeDoc as {} as Element
        || D,
    isD = box === D,
    querySelectorAll = Build.BTypes & ~BrowserType.Firefox
      ? /* just smaller code */ (isD ? D : Element.prototype).querySelectorAll : box.querySelectorAll;
    let list: HintsNS.HintSources | null = querySelectorAll.call(box, selector) as NodeListOf<SafeElement>,
    tree_scopes: Array<[HintsNS.HintSources, number]> = [[list, 0]],
    shadowQueryAll: ShadowRoot["querySelectorAll"] | undefined;
    wantClickable && Sc.getScale_();
    if (matchAll) {
      if (a.ngEnabled_ === null) {
        a.ngEnabled_ = !!D.querySelector(".ng-scope");
      }
      if (a.jsaEnabled_ === null) {
        a.jsaEnabled_ = !!D.querySelector("[jsaction]");
      }
    }
    if (!matchAll) {
      list = a.addShadowHosts_(list, querySelectorAll.call(box, a.kSafeAllSelector_) as NodeListOf<SafeElement>);
    }
    if (!wholeDoc && a.tooHigh_ && isD && list.length >= GlobalConsts.LinkHintPageHeightLimitToCheckViewportFirst) {
      list = a.getElementsInViewPort_(list);
    }
    if (!Build.NDEBUG && isInAnElement) {
      // just for easier debugging
      list = [].slice.call(list);
      list.unshift(wholeDoc as {} as SafeElement);
    }
    while (tree_scopes.length > 0) {
      let cur_scope = tree_scopes[tree_scopes.length - 1], [cur_tree, i] = cur_scope, len = cur_tree.length
        , el: SafeElement & {lang?: undefined} | SafeHTMLElement, shadowRoot: ShadowRoot | null | undefined;
      for (; i < len; ) {
        el = cur_tree[i++] as SafeElement & {lang?: undefined} | SafeHTMLElement;
        if (el.lang != null) {
          filter.call(a, output, el);
          shadowRoot = Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinEnsuredUnprefixedShadowDOMV0
                && VDom.cache_.v < BrowserVer.MinEnsuredUnprefixedShadowDOMV0
              ? el.webkitShadowRoot as ShadowRoot | null | undefined : el.shadowRoot as ShadowRoot | null | undefined;
          if (shadowRoot) {
            shadowQueryAll || (shadowQueryAll = shadowRoot.querySelectorAll);
            let sub_tree: HintsNS.HintSources = shadowQueryAll.call(shadowRoot, selector) as NodeListOf<SafeElement>;
            if (!matchAll) {
              sub_tree = a.addShadowHosts_(sub_tree,
                  shadowQueryAll.call(shadowRoot, a.kSafeAllSelector_) as NodeListOf<SafeElement>);
            }
            cur_scope[1] = i;
            tree_scopes.push([sub_tree, i = 0]);
            break;
          }
        } else if (wantClickable) {
          a.GetClickableInMaybeSVG_(output as Exclude<typeof output, SafeHTMLElement[]>, el);
        }
      }
      if (i >= len) {
        tree_scopes.pop();
      }
    }
    if (wholeDoc && (Build.NDEBUG || !isInAnElement)) {
      // this requires not detecting scrollable elements if wholeDoc
      if (!(Build.NDEBUG || filter !== a.GetClickable_ && !isInAnElement)) {
        console.log("Assert error: `filter !== VHints.GetClickable_` in VHints.traverse_");
      }
      return output;
    }
    list = null;
    if (uiRoot
        && ((!(Build.BTypes & BrowserType.Chrome) || Build.MinCVer >= BrowserVer.MinShadowDOMV0)
            && (!(Build.BTypes & BrowserType.Firefox) || Build.MinFFVer >= FirefoxBrowserVer.MinEnsuredShadowDOMV1)
            && !(Build.BTypes & ~BrowserType.ChromeOrFirefox)
          || uiRoot !== d.UI.box_)
        && !notWantVUI
        && ( !(Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinNoShadowDOMv0)
          || (!(Build.BTypes & BrowserType.Chrome) || Build.MinCVer >= BrowserVer.MinEnsuredShadowDOMV1)
            && (!(Build.BTypes & BrowserType.Firefox) || Build.MinFFVer >= FirefoxBrowserVer.MinEnsuredShadowDOMV1)
            && !(Build.BTypes & ~BrowserType.ChromeOrFirefox)
          || uiRoot.mode === "closed")
        ) {
      const z = d.dbZoom_, bz = d.bZoom_, notHookScroll = Sc.scrolled_ === 0;
      if (bz !== 1 && isD) {
        d.dbZoom_ = z / bz;
        d.prepareCrop_();
      }
      for (const el of (<ShadowRoot> uiRoot).querySelectorAll(selector)) {
        filter.call(a, output, el as SafeHTMLElement);
      }
      d.dbZoom_ = z;
      if (notHookScroll) {
        Sc.scrolled_ = 0;
      }
    }
    Sc.scrolled_ === 1 && Sc.supressScroll_();
    if (wantClickable) { a.deduplicate_(output as Hint[]); }
    if (a.frameNested_ === null) { /* empty */ }
    else if (wantClickable) {
      a.checkNestedFrame_(output as Hint[]);
    } else if (output.length > 0) {
      a.frameNested_ = null;
    } else {
      a.checkNestedFrame_();
    }
    return output as Hint[];
  } as {
    (key: string, filter: HintsNS.Filter<SafeHTMLElement>, notWantVUI?: true, wholeDoc?: true): SafeHTMLElement[];
    (key: string, filter: HintsNS.Filter<Hint>, notWantVUI?: boolean): Hint[];
  },
  addShadowHosts_ (list: HintsNS.HintSources, allNodes: NodeListOf<SafeElement>): HintsNS.HintSources {
    let matchWebkit = Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinEnsuredUnprefixedShadowDOMV0
                      && VDom.cache_.v < BrowserVer.MinEnsuredUnprefixedShadowDOMV0;
    let hosts: SafeElement[] = [], matched: SafeElement | undefined;
    for (let i = 0, len = allNodes.length; i < len; i++) {
      let el = allNodes[i];
      if (Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinEnsuredUnprefixedShadowDOMV0
            && matchWebkit ? el.webkitShadowRoot : el.shadowRoot) {
        hosts.push(matched = el);
      }
    }
    return matched ? [].slice.call<ArrayLike<SafeElement>, [], SafeElement[]>(list).concat(hosts) : list;
  },
  getElementsInViewPort_ (list: HintsNS.HintSources): HintsNS.HintSources {
    const result: SafeElement[] = [], height = innerHeight;
    for (let i = 1, len = list.length; i < len; i++) { // skip docEl
      const el = list[i];
      const cr = VDom.getBoundingClientRect_(el);
      if (cr.bottom > 0 && cr.top < height) {
        result.push(el);
        continue;
      }
      const last = el.lastElementChild;
      if (!last) { continue; }
      if (Build.BTypes & ~BrowserType.Firefox && VDom.notSafe_(el)) { continue; }
      while (list[++i] !== last) { /* empty */ }
      i--;
    }
    return result.length > 12 ? result : list;
  },
  deduplicate_ (list: Hint[]): void {
    let i = list.length, j: number, k: ClickType, s: string;
    while (0 < --i) {
      k = list[i][2];
      if (k === ClickType.codeListener) {
        if ((list[i][0] as Exclude<Hint[0], SVGElement>).localName === "div"
            && (j = i + 1) < list.length
            && (s = list[j][0].localName, s === "div" || s === "a")) {
          const prect = list[i][1], crect = list[j][1];
          if (crect[0] < prect[0] + /* icon_16 */ 18 && crect[1] < prect[1] + 9
              && crect[0] > prect[0] - 4 && crect[1] > prect[1] - 4 && crect[3] > prect[3] - 9
              && (s !== "a" || list[i][0].contains(list[j][0]))) {
            // the `<a>` is a single-line box's most left element and the first clickable element,
            // so think the box is just a layout container
            // for [i] is `<div>`, not limit the height of parent `<div>`,
            // if there's more content, it should have hints for itself
            list.splice(i, 1);
          }
          continue;
        }
        j = i;
      } else if (k !== ClickType.classname) { j = i; }
      else if ((k = list[j = i - 1][2]) > ClickType.MaxWeak || !this._isDescendant(list[i][0], list[j][0])) {
        continue;
      } else if (VDom.isContaining_(list[j][1], list[i][1])) {
        list.splice(i, 1);
        continue;
      } else if (k < ClickType.MinWeak) {
        continue;
      }
      for (; j > i - 3 && 0 < j
            && (k = list[j - 1][2]) > ClickType.MaxNotWeak && k < ClickType.MinNotWeak
            && this._isDescendant(list[j][0], list[j - 1][0])
          ; j--) { /* empty */ }
      if (j < i) {
        list.splice(j, i - j);
        i = j;
      }
    }
    while (list.length && (list[0][0] === document.documentElement || list[0][0] === document.body)) {
      list.shift();
    }
  },
  _isDescendant (d: Element, p: Hint[0]): boolean {
    // Note: currently, not compute normal shadowDOMs / even <slot>s (too complicated)
    let i = 3, c: EnsuredMountedElement | null | undefined, f: Node | null;
    while (0 < i--
        && (c = (Build.BTypes & ~BrowserType.Firefox ? VDom.GetParent_(d, PNType.DirectElement)
                : d.parentElement as Element | null) as EnsuredMountedElement | null)
        && c !== <Element> p
        && !(Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinFramesetHasNoNamedGetter
              && VDom.unsafeFramesetTag_ && (c as Element["firstElementChild"] as WindowWithTop).top === top)
        ) {
      d = c;
    }
    if (c !== <Element> p) { return false; }
    for (; ; ) {
      if (c.childElementCount !== 1 || ((f = c.firstChild) instanceof Text && f.data.trim())) { return false; }
      if (i === 2) { break; }
      c = c.firstElementChild; i++;
    }
    return true;
  },
  frameNested_: false as HintsNS.NestedFrame,
  checkNestedFrame_ (output?: Hint[]): void {
    const res = output && output.length > 1 ? null : !frames.length ? false
      : (!(Build.BTypes & ~BrowserType.Firefox) ? fullScreen
          : !(Build.BTypes & ~BrowserType.Chrome) || Build.MinCVer >= BrowserVer.MinEnsured$Document$$fullscreenElement
          ? document.fullscreenElement : document.webkitIsFullScreen)
      ? 0 : this._getNestedFrame(output);
    this.frameNested_ = res === false && document.readyState === "complete" ? null : res;
  },
  _getNestedFrame (output?: Hint[]): HintsNS.NestedFrame {
    if (output == null) {
      if (!VDom.isHTML_()) { return false; }
      output = [];
      for (let el of document.querySelectorAll("a,button,input,frame,iframe")) {
        if ((el as ElementToHTML).lang != null) {
          this.GetClickable_(output, el as SafeHTMLElement);
        }
      }
    }
    if (output.length !== 1) {
      return output.length !== 0 && null;
    }
    let rect: ClientRect | undefined, rect2: ClientRect, element = output[0][0];
    if ((<RegExpI> /^i?frame$/).test(VDom.htmlTag_(element))
        && (rect = element.getClientRects()[0])
        && (rect2 = VDom.getBoundingClientRect_(document.documentElement as HTMLElement))
        && rect.top - rect2.top < 20 && rect.left - rect2.left < 20
        && rect2.right - rect.right < 20 && rect2.bottom - rect.bottom < 20
        && getComputedStyle(element).visibility === "visible"
    ) {
      return element as HTMLFrameElement | HTMLIFrameElement;
    }
    return null;
  },
  getVisibleElements_ (view: ViewBox): Hint[] {
    let a = this, _i: number = a.mode1_,
    visibleElements = _i > HintMode.min_media - 1 && _i < HintMode.max_media + 1
      // not check `img[src]` in case of `<img srcset=... >`
      ? a.traverse_("a[href],img,div[style],span[style],[data-src]"
          + (Build.BTypes & ~BrowserType.Firefox ? a.kSafeAllSelector_ : "")
          + (_i - HintMode.DOWNLOAD_MEDIA ? "" : ",video,audio"), a.GetImages_, true)
      : _i > HintMode.min_link_job - 1 && _i < HintMode.max_link_job + 1 ? a.traverse_("a", a.GetLinks_)
      : _i - HintMode.FOCUS_EDITABLE ? a.traverse_(a.kSafeAllSelector_, a.GetClickable_)
      : a.traverse_(Build.BTypes & ~BrowserType.Firefox
            ? a.kEditableSelector_ + a.kSafeAllSelector_ : a.kEditableSelector_, a.GetEditable_);
    a.maxLeft_ = view[2], a.maxTop_ = view[3], a.maxRight_ = view[4];
    if (a.maxRight_ > 0) {
      _i = Math.ceil(Math.log(visibleElements.length) / Math.log(a.alphabetHints_.chars_.length));
      a.maxLeft_ -= 16 * _i + 12;
    }
    visibleElements.reverse();

    const obj = [null as never, null as never] as [Rect[], Rect], func = VDom.SubtractSequence_.bind(obj);
    let r2 = null as Rect[] | null, t: Rect, reason: ClickType, visibleElement: Hint;
    for (let _len = visibleElements.length, _j = Math.max(0, _len - 16); 0 < --_len; ) {
      _j > 0 && --_j;
      visibleElement = visibleElements[_len];
      if (visibleElement[2] > ClickType.MaxNotBox) { continue; }
      let r = visibleElement[1];
      for (_i = _len; _j <= --_i; ) {
        t = visibleElements[_i][1];
        if (r[3] <= t[1] || r[2] <= t[0] || r[0] >= t[2] || r[1] >= t[3]) { continue; }
        if (visibleElements[_i][2] > ClickType.MaxNotBox) { continue; }
        obj[0] = []; obj[1] = t;
        r2 !== null ? r2.forEach(func) : func(r);
        if ((r2 = obj[0]).length === 0) { break; }
      }
      if (r2 === null) { continue; }
      if (r2.length > 0) {
        t = r2[0];
        t[1] > a.maxTop_ && t[1] > r[1] || t[0] > a.maxLeft_ && t[0] > r[0] ||
          r2.length === 1 && (t[3] - t[1] < 3 || t[2] - t[0] < 3) || (visibleElement[1] = t);
      } else if ((reason = visibleElement[2]) > ClickType.MaxNotWeak && reason < ClickType.MinNotWeak
          && visibleElement[0].contains(visibleElements[_i][0])) {
        visibleElements.splice(_len, 1);
      } else {
        visibleElement.length > 3 && (r = (visibleElement as Hint4)[3][0]);
        for (let _k = _len; _i <= --_k; ) {
          t = visibleElements[_k][1];
          if (r[0] >= t[0] && r[1] >= t[1] && r[0] < t[0] + 10 && r[1] < t[1] + 8) {
            const offset: HintOffset = [r, visibleElement.length > 3 ? (visibleElement as Hint4)[3][1] + 13 : 13],
            hint2 = visibleElements[_k] as Hint4;
            hint2.length > 3 ? (hint2[3] = offset) : (hint2 as {} as HintOffset[]).push(offset);
            break;
          }
        }
      }
      r2 = null;
    }
    return visibleElements.reverse();
  },
  onKeydown_ (event: KeyboardEvent): HandlerResult {
    const a = this;
    let linksMatched: HintsNS.LinksMatched, i: number;
    if (event.repeat || !a.isActive_) {
      // NOTE: should always prevent repeated keys.
    } else if (VKey.isEscape_(event)) {
      a.clean_();
    } else if ((i = event.keyCode) === kKeyCode.esc) {
      return HandlerResult.Suppress;
    } else if (i === kKeyCode.ime) {
      a.clean_(1);
      VHud.tip_("LinkHints exits because you're inputting");
      return HandlerResult.Nothing;
    } else if (i > kKeyCode.f1 && i <= kKeyCode.f12) {
      a.ResetMode_();
      if (i !== kKeyCode.f2) { return HandlerResult.Nothing; }
      i = VKey.getKeyStat_(event);
      let reinit = true;
      if (i === KeyStat.altKey) {
        reinit = (!(Build.BTypes & ~BrowserType.Chrome) && Build.MinCVer >= BrowserVer.MinEnsuredHTMLDialogElement)
          || typeof HTMLDialogElement === "function"; // safe enough even if it's an <embed>
        a.dialogMode_ = reinit && !a.dialogMode_;
      } else if (i & KeyStat.PrimaryModifier) {
        reinit = !!VEvent.execute_;
        if (reinit) {
          a.isClickListened_ = true;
          (VEvent as EnsureNonNull<VEventModeTy>).execute_(kContentCmd.FindAllOnClick);
        }
      } else if (i & KeyStat.shiftKey) {
        a.isClickListened_ = !a.isClickListened_;
      } else {
        reinit = false;
      }
      reinit && setTimeout(a._reinit.bind(a, null, null), 0);
    } else if (i < kKeyCode.maxAcsKeys + 1 && i > kKeyCode.minAcsKeys - 1
        || (i === kKeyCode.metaKey && VDom.cache_.m)) {
      const mode = a.mode_, mode1 = a.mode1_,
      mode2 = mode1 > HintMode.min_copying - 1 && mode1 < HintMode.max_copying + 1
        ? i === kKeyCode.ctrlKey ? (mode1 | HintMode.queue) ^ HintMode.list
          : i === kKeyCode.altKey ? (mode & ~HintMode.list) ^ HintMode.queue
          : mode
        : i === kKeyCode.altKey
        ? mode < HintMode.min_disable_queue
          ? ((mode1 < HintMode.min_job ? HintMode.newTab : HintMode.empty) | mode) ^ HintMode.queue : mode
        : mode1 < HintMode.min_job
          ? i === kKeyCode.shiftKey ? (mode | HintMode.focused) ^ HintMode.mask_focus_new
          : (mode | HintMode.newTab) ^ HintMode.focused
        : mode;
      if (mode2 !== mode) {
        a.setMode_(mode2);
        i = VKey.getKeyStat_(event);
        (i & (i - 1)) || (a.lastMode_ = mode);
      }
    } else if (i <= kKeyCode.down && i >= kKeyCode.pageup) {
      VEvent.scroll_(event);
      a.ResetMode_();
    } else if (i === kKeyCode.space) {
      a.zIndexes_ === false || a.rotateHints_(event.shiftKey);
      event.shiftKey && a.ResetMode_();
    } else if (!(linksMatched
        = a.alphabetHints_.matchHintsByKey_(a.hints_ as HintsNS.HintItem[], event, a.keyStatus_))) {
      if (linksMatched === false) {
        a.tooHigh_ = null;
        setTimeout(a._reinit.bind(a, null, null), 0);
      }
    } else if (linksMatched.length === 0) {
      a.deactivate_(a.keyStatus_.known_);
    } else if (linksMatched.length === 1) {
      VKey.prevent_(event);
      /** safer; necessary for {@link #VHints._highlightChild} */
      VEvent.keydownEvents_()[i] = 1;
      a.keyCode_ = i;
      a.execute_(linksMatched[0]);
    } else {
      a.hideSpans_(linksMatched);
    }
    return HandlerResult.Prevent;
  },
  hideSpans_ (linksMatched: HintsNS.HintItem[]): void {
    const limit = this.keyStatus_.tab_ ? 0 : this.keyStatus_.newHintLength_;
    let newClass: string;
    for (const { marker_: { childNodes: ref } } of linksMatched) {
// https://cs.chromium.org/chromium/src/third_party/blink/renderer/core/dom/dom_token_list.cc?q=DOMTokenList::setValue&g=0&l=258
// shows that `.classList.add()` costs more
      for (let j = ref.length - 1; 0 <= --j; ) {
        newClass = j < limit ? "MC" : "";
        (ref[j] as Exclude<HintsNS.MarkerElement, Text>).className !== newClass &&
        ((ref[j] as Exclude<HintsNS.MarkerElement, Text>).className = newClass);
      }
    }
  },
  ResetMode_ (): void {
    let a = VHints, d: KeydownCacheArray;
    if (a.lastMode_ !== a.mode_ && a.mode_ < HintMode.min_disable_queue) {
      d = VEvent.keydownEvents_();
      if (d[kKeyCode.ctrlKey] || d[kKeyCode.metaKey] || d[kKeyCode.shiftKey] || d[kKeyCode.altKey]) {
        a.setMode_(a.lastMode_);
      }
    }
  },
  resetHints_ (): void {
    let ref = this.hints_, i = 0, len = ref ? ref.length : 0;
    this.hints_ = this.zIndexes_ = null;
    this.pTimer_ > 0 && clearTimeout(this.pTimer_);
    while (i < len) { (ref as HintsNS.HintItem[])[i++].dest_ = null as never; }
  },
  execute_ (hint: HintsNS.HintItem): void {
    const a = this;
    let rect: Rect | null | undefined, clickEl: HintsNS.LinkEl | null = hint.dest_;
    a.resetHints_();
    const str = a.modeOpt_[a.modeOpt_.indexOf(a.mode_) + 1] as string;
    (VHud as Writable<VHUDTy>).text_ = str; // in case pTimer > 0
    if (VDom.isInDOM_(clickEl)) {
      // must get outline first, because clickEl may hide itself when activated
      // must use UI.getRect, so that VDom.zooms are updated, and prepareCrop is called
      rect = VDom.UI.getRect_(clickEl, hint.refer_ !== clickEl ? hint.refer_ as HTMLElementUsingMap | null : null);
      const showRect = a.modeOpt_[0](clickEl, rect, hint);
      if (showRect !== false && (rect || (rect = VDom.getVisibleClientRect_(clickEl)))) {
        setTimeout(function (): void {
          (showRect || document.hasFocus()) && VDom.UI.flash_(null, rect as Rect);
        }, 17);
      }
    } else {
      clickEl = null;
      VHud.tip_("The link has been removed from page", 2000);
    }
    a.pTimer_ = -(VHud.text_ !== str);
    if (!(a.mode_ & HintMode.queue)) {
      a._setupCheck(clickEl);
      return a.deactivate_(0);
    }
    a.isActive_ = false;
    a._setupCheck();
    setTimeout(function (): void {
      const _this = VHints;
      _this._reinit(clickEl, rect);
      if (1 === --_this.count_ && _this.isActive_) {
        return _this.setMode_(_this.mode1_);
      }
    }, 18);
  },
  _reinit (lastEl?: HintsNS.LinkEl | null, rect?: Rect | null): void {
    const a = this, events = VEvent;
    if (events.keydownEvents_(Build.BTypes & BrowserType.Firefox ? events.keydownEvents_() : events)) {
      a.clean_();
      return;
    }
    a.isActive_ = false;
    a.keyStatus_.tab_ = 0;
    a.zIndexes_ = null;
    a.resetHints_();
    const isClick = a.mode1_ < HintMode.min_job;
    a.activate_(0, a.options_);
    a._setupCheck(lastEl, rect, isClick);
  },
  _setupCheck (el?: HintsNS.LinkEl | null, r?: Rect | null, isClick?: boolean): void {
    const a = this;
    a.timer_ && clearTimeout(a.timer_);
    a.timer_ = el && (isClick || a.mode1_ < HintMode.min_job) ? setTimeout(function (i): void {
      Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinNo$TimerType$$Fake && i ||
      VHints && VHints.CheckLast_(el, r);
    }, 255) : 0;
  },
  // if not el, then reinit if only no key stroke and hints.length < 64
  CheckLast_ (this: void, el?: HintsNS.LinkEl | TimerType.fake, r?: Rect | null): void {
    const _this = VHints, events = VEvent;
    if (!_this) { return; }
    _this.timer_ = 0;
    if (events.keydownEvents_(Build.BTypes & BrowserType.Firefox ? events.keydownEvents_() : events)) {
      return _this.clean_();
    }
    const r2 = el && (!(Build.BTypes & BrowserType.Chrome) || Build.MinCVer >= BrowserVer.MinNo$TimerType$$Fake
                      || el !== TimerType.fake) ? VDom.getBoundingClientRect_(el as HintsNS.LinkEl) : 0,
    hidden = !r2 || r2.width < 1 && r2.height < 1 || getComputedStyle(el as HintsNS.LinkEl).visibility !== "visible";
    if (hidden && VDom.lastHovered_ === el) {
      VDom.lastHovered_ = null;
    }
    if ((!r2 || r) && _this.isActive_ && (_this.hints_ as HintsNS.HintItem[]).length < 64
        && !_this.alphabetHints_.hintKeystroke_
        && (hidden || Math.abs((r2 as ClientRect).left - (r as Rect)[0]) > 100
            || Math.abs((r2 as ClientRect).top - (r as Rect)[1]) > 60)) {
      return _this._reinit();
    }
  },
  clean_ (keepHUD?: boolean | BOOL): void {
    const a = this,
    ks = a.keyStatus_, alpha = a.alphabetHints_;
    a.options_ = a.modeOpt_ = a.zIndexes_ = a.hints_ = null as never;
    a.pTimer_ > 0 && clearTimeout(a.pTimer_);
    a.lastMode_ = a.mode_ = a.mode1_ = a.count_ = a.pTimer_ =
    a.maxLeft_ = a.maxTop_ = a.maxRight_ =
    ks.tab_ = ks.newHintLength_ = ks.known_ = alpha.countMax_ = 0;
    a.keyCode_ = kKeyCode.None;
    alpha.hintKeystroke_ = alpha.chars_ = a.yankedList_ = "";
    a.isActive_ = a.noHUD_ = a.tooHigh_ = a.doesMapKey_ = false;
    VKey.removeHandler_(a);
    VEvent.onWndBlur_(null);
    if (a.box_) {
      a.box_.remove();
      a.box_ = null;
    }
    keepHUD || VHud.hide_();
  },
  deactivate_ (isLastKeyKnown: BOOL): void {
    this.clean_(this.pTimer_ < 0);
    (<RegExpOne> /0?/).test("");
    VKey.suppressTail_(isLastKeyKnown ? 0 : VDom.cache_.k[0]);
  },
  rotateHints_ (reverse?: boolean): void {
    const a = this;
    let ref = a.hints_ as HintsNS.HintItem[], stacks = a.zIndexes_;
    if (!stacks) {
      stacks = [] as HintsNS.Stacks;
      ref.forEach(a.MakeStacks_, [[], stacks] as [Array<ClientRect | null>, HintsNS.Stacks]);
      stacks = stacks.filter(stack => stack.length > 1);
      if (stacks.length <= 0) {
        a.zIndexes_ = a.keyStatus_.newHintLength_ <= 0 ? false : null;
        return;
      }
      a.zIndexes_ = stacks;
    }
    for (const stack of stacks) {
      reverse && stack.reverse();
      const i = stack[stack.length - 1];
      let oldI = ref[i].zIndex_ || i;
      for (const j of stack) {
        const hint = ref[j], {style} = hint.marker_, newI = hint.zIndex_ || j;
        style.zIndex = (hint.zIndex_ = oldI) as number | string as string;
        oldI = newI;
      }
      reverse && stack.reverse();
    }
  },
  MakeStacks_ (this: [Array<ClientRect | null>, HintsNS.Stacks], hint: HintsNS.HintItem, i: number) {
    let rects = this[0];
    if (hint.marker_.style.visibility === "hidden") { rects.push(null); return; }
    const stacks = this[1], m = hint.marker_.getClientRects()[0];
    rects.push(m);
    let stackForThisMarker = null as HintsNS.Stack | null;
    for (let j = 0, len2 = stacks.length; j < len2; ) {
      let stack = stacks[j], k = 0, len3 = stack.length;
      for (; k < len3; k++) {
        const t = rects[stack[k]] as ClientRect;
        if (m.bottom > t.top && m.top < t.bottom && m.right > t.left && m.left < t.right) {
          break;
        }
      }
      if (k >= len3) { /* empty */ }
      else if (stackForThisMarker) {
        stackForThisMarker.push(...stack);
        stacks.splice(j, 1); len2--;
        continue;
      } else {
        stack.push(i);
        stackForThisMarker = stack;
      }
      j++;
    }
    stackForThisMarker || stacks.push([i]);
  },

alphabetHints_: {
  chars_: "",
  hintKeystroke_: "",
  countMax_: 0,
  countLimit_: 0,
  numberToHintString_ (num: number): string {
    const characterSet = this.chars_, base = characterSet.length;
    let hintString = "";
    do {
      let remainder = num % base;
      num = (num / base) | 0;
      hintString = characterSet[remainder] + hintString;
    } while (num > 0);
    num = this.countMax_ - hintString.length - +(num < this.countLimit_);
    if (num > 0) {
      hintString = (Build.MinCVer >= BrowserVer.MinSafe$String$$StartsWith
              || !(Build.BTypes & BrowserType.Chrome)
          ? (characterSet[0] as Ensure<string, "repeat">).repeat(num)
          : (this as Ensure<typeof VHints.alphabetHints_, "repeat_">).repeat_(characterSet[0], num)
        ) + hintString;
    }
    return hintString;
  },
  initMarkers_ (hintItems: HintsNS.HintItem[]): void {
    const a = this;
    a.hintKeystroke_ = "";
    for (let end = hintItems.length, hints = a.buildHintIndexes_(end), h = 0; h < end; h++) {
      const hint = hintItems[h], marker = hint.marker_,
      hintString = hint.key_ = a.numberToHintString_(hints[h]), last = hintString.length - 1;
      for (let i = 0; i < last; i++) {
        const node = document.createElement("span");
        node.textContent = hintString[i];
        marker.appendChild(node);
      }
      marker.insertAdjacentText("beforeend", hintString[last]);
    }
    a.countMax_ -= (a.countLimit_ > 0) as boolean | number as number;
    a.countLimit_ = 0;
  },
  buildHintIndexes_ (linkCount: number): number[] {
    const hints: number[] = [], result: number[] = [], len = this.chars_.length, count = linkCount, start = count % len;
    let i = this.countMax_ = Math.ceil(Math.log(count) / Math.log(len)), max = count - start + len
      , end = this.countLimit_ = ((Math.pow(len, i) - count) / (len - 1)) | 0;
    for (i = 0; i < end; i++) {
      hints.push(i);
    }
    for (end *= len - 1; i < count; i++) {
      hints.push(i + end);
    }
    for (i = 0; i < len; i++) {
      if (i === start) { max -= len; }
      for (let j = i; j < max; j += len) {
        result.push(hints[j]);
      }
    }
    return result;
  },
  matchHintsByKey_ (hints: HintsNS.HintItem[], e: KeyboardEvent, keyStatus: HintsNS.KeyStatus): HintsNS.LinksMatched {
    const a = this;
    let keyChar: string, key = e.keyCode, arr = null as HintsNS.HintItem[] | null;
    if (key === kKeyCode.tab) {
      if (!a.hintKeystroke_) {
        return false;
      }
      keyStatus.tab_ = (1 - keyStatus.tab_) as BOOL;
    } else if (keyStatus.tab_) {
      a.hintKeystroke_ = "";
      keyStatus.tab_ = 0;
    }
    keyStatus.known_ = 1;
    if (key === kKeyCode.tab) { /* empty */ }
    else if (key === kKeyCode.backspace || key === kKeyCode.deleteKey || key === kKeyCode.f1) {
      if (!a.hintKeystroke_) {
        return [];
      }
      a.hintKeystroke_ = a.hintKeystroke_.slice(0, -1);
    } else if ((keyChar = VKey.char_(e)) && keyChar.length === 1
        && (keyChar = (VHints.doesMapKey_ ? VEvent.mapKey_(keyChar, e) : keyChar).toUpperCase()).length === 1) {
      if (a.chars_.indexOf(keyChar) === -1) {
        return [];
      }
      a.hintKeystroke_ += keyChar;
      arr = [];
    } else {
      return null;
    }
    keyChar = a.hintKeystroke_;
    keyStatus.newHintLength_ = keyChar.length;
    keyStatus.known_ = 0;
    VHints.zIndexes_ && (VHints.zIndexes_ = null);
    const wanted = !keyStatus.tab_;
    if (arr !== null && keyChar.length >= a.countMax_) {
      hints.some(function (hint): boolean {
        return hint.key_ === keyChar && ((arr as HintsNS.HintItem[]).push(hint), true);
      });
      if (arr.length === 1) { return arr; }
    }
    return hints.filter(function (hint) {
      const pass = (hint.key_ as string).startsWith(keyChar) === wanted;
      hint.marker_.style.visibility = pass ? "" : "hidden";
      return pass;
    });
  },
  repeat_: !(Build.BTypes & BrowserType.Chrome) || Build.MinCVer >= BrowserVer.MinSafe$String$$StartsWith ? 0 as never
      : function (this: void, s: string, n: number): string {
    if (s.repeat) { return s.repeat(n); }
    for (var s2 = s; --n; ) { s2 += s; }
    return s2;
  }
},

decodeURL_ (this: void, url: string, decode?: (this: void, url: string) => string): string {
  try { url = (decode || decodeURI)(url); } catch {}
  return url;
},
jsRe_: <RegExpI & RegExpOne> /^javascript:/i,
_imageUrlRe: <RegExpI & RegExpOne> /\.(?:bmp|gif|icon?|jpe?g|png|svg|tiff?|webp)\b/i,
isImageUrl_ (str: string | null): boolean {
  if (!str || str[0] === "#" || str.length < 5 || str.startsWith("data:") || this.jsRe_.test(str)) {
    return false;
  }
  const end = str.lastIndexOf("#") + 1 || str.length;
  // tslint:disable-next-line: ban-types
  str = (str as EnsureNonNull<String>).substring(str.lastIndexOf("/", str.lastIndexOf("?") + 1 || end), end);
  return this._imageUrlRe.test(str);
},
getUrlData_ (link: HTMLAnchorElement): string {
  const str = link.dataset.vimUrl;
  if (str) {
    link = VDom.createElement_("a");
    link.href = str.trim();
  }
  // $1.href is ensured well-formed by @GetLinks_
  return link.href;
},
/** return: img is HTMLImageElement | HTMLAnchorElement */
_getImageUrl (img: SafeHTMLElement, forShow?: 1): string | void {
  let text: string | null, src = img.dataset.src || "", elTag = img.localName;
  if (elTag === "img") {
    text = (img as HTMLImageElement).currentSrc || img.getAttribute("src") && (img as HTMLImageElement).src;
  } else {
    text = elTag === "a" ? img.getAttribute("href") && (img as HTMLAnchorElement).href : "";
    if (!this.isImageUrl_(text)) {
      let arr = (<RegExpI> /^url\(\s?['"]?((?:\\['"]|[^'"])+?)['"]?\s?\)/i).exec(img.style.backgroundImage as string);
      if (arr && arr[1]) {
        const a1 = document.createElement("a");
        a1.href = arr[1].replace(<RegExpG> /\\(['"])/g, "$1");
        text = a1.href;
      }
    }
  }
  if (!text || forShow && text.startsWith("data:") || this.jsRe_.test(text)
      || src.length > text.length + 7 && (text === (img as HTMLElement & {href?: string}).href)) {
    text = src;
  }
  return text || VHud.tip_("Not an image", 1000);
},
getImageName_: (img: SafeHTMLElement): string | null =>
  img.getAttribute("download") || img.title || img.getAttribute("alt"),

openUrl_ (url: string, incognito?: boolean): void {
  let kw = this.options_.keyword, opt: Req.fg<kFgReq.openUrl> = {
    H: kFgReq.openUrl,
    r: this.mode_ & HintMode.queue ? ReuseType.newBg : ReuseType.newFg,
    u: url,
    k: kw != null ? kw + "" : ""
  };
  incognito && (opt.i = incognito);
  VPort.post_(opt);
},
_highlightChild (el: HTMLIFrameElement | HTMLFrameElement): false | void {
  let err: boolean | null = true, childEvents: VEventModeTy | undefined,
  core: ContentWindowCore | void | undefined | 0;
  try {
    err = !el.contentDocument
        || !(core = Build.BTypes & BrowserType.Firefox ? VDom.getWndCore_(el.contentWindow) : el.contentWindow)
        || !(childEvents = core.VEvent)
        || childEvents.keydownEvents_(Build.BTypes & BrowserType.Firefox ? VEvent.keydownEvents_() : VEvent);
  } catch (e) {
    if (!Build.NDEBUG) {
      let notDocError = true;
      if (Build.BTypes & BrowserType.Chrome && VDom.cache_.v < BrowserVer.Min$ContentDocument$NotThrow) {
        try {
          notDocError = el.contentDocument !== undefined;
        } catch { notDocError = false; }
      }
      if (notDocError) {
        console.log("Assert error: Child frame check breaks:", e);
      }
    }
  }
  const { count_: count, options_: options } = this;
  options.mode = this.mode_;
  el.focus();
  if (err) {
    VPort.send_(kFgReq.execInChild, {
      u: el.src, c: kFgCmd.linkHints, n: count, k: this.keyCode_, a: options
    }, function (res): void {
      if (!res) {
        el.contentWindow.focus();
      }
    });
    return;
  }
  (childEvents as NonNullable<typeof childEvents>).focusAndRun_(kFgCmd.linkHints, count, options, 1);
  return false;
},

Modes_: [
[
  (element, rect): void => {
    const a = VHints, type = VDom.getEditableType_<0>(element), toggleMap = a.options_.toggle;
    // here not check VDom.lastHovered on purpose
    // so that "HOVER" -> any mouse events from users -> "HOVER" can still work
    VScroller.current_ = element;
    VDom.hover_(element, VDom.center_(rect));
    type || element.tabIndex < 0 ||
    (<RegExpI> /^i?frame$/).test(VDom.htmlTag_(element)) && element.focus && element.focus();
    if (a.mode1_ < HintMode.min_job) { // called from Modes[-1]
      return VHud.tip_("Hover for scrolling", 1000);
    }
    if (!toggleMap || typeof toggleMap !== "object") { return; }
    VKey.safer_(toggleMap);
    let ancestors: Element[] = [], topest: Element | null = element, re = <RegExpOne> /^-?\d+/;
    for (let key in toggleMap) {
      // if no Element::closest, go up by 6 levels and then query the selector
      let selector = key, prefix = re.exec(key), upper = prefix && prefix[0];
      if (upper) {
        selector = selector.slice(upper.length);
      }
      let up = (upper as string | number as number) | 0, selected: Element | null = null;
      if (Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinEnsured$Element$$Closest && !up) {
        up = element.closest ? 0 : 6;
      }
      selector = selector.trim();
      while (up && up + 1 >= ancestors.length && topest) {
        ancestors.push(topest);
        topest = VDom.GetParent_(topest, PNType.RevealSlotAndGotoParent);
      }
      try {
        if (selector && (selected = up
              ? Build.BTypes & ~BrowserType.Firefox
                ? Element.prototype.querySelector.call(ancestors[Math.max(0, Math.min(up + 1, ancestors.length - 1))]
                    , selector)
                : (ancestors[Math.max(0, Math.min(up + 1, ancestors.length - 1))]).querySelector(selector)
              : (element as EnsureNonNull<Element>).closest(selector))) {
          for (const clsName of toggleMap[key].split(" ")) {
            clsName.trim() && selected.classList.toggle(clsName);
          }
        }
      } catch {}
      if (selected) {
        break;
      }
    }
  }
  , HintMode.HOVER, "Hover over node"
  , HintMode.HOVER | HintMode.queue, "Hover over nodes continuously"
] as HintsNS.ModeOpt,
[
  (element: SafeHTMLElement | SVGElement): void => {
    const a = VDom;
    if (a.lastHovered_ !== element) {
      a.hover_(null);
    }
    a.lastHovered_ = element;
    a.hover_(null);
    if (document.activeElement === element) { element.blur(); }
  }
  , HintMode.LEAVE, "Simulate mouse leaving link"
  , HintMode.LEAVE | HintMode.queue, "Simulate mouse leaving continuously"
] as HintsNS.ModeOpt,
[
  (link): void => {
    const a = VHints, mode1 = a.mode1_;
    let isUrl = mode1 > HintMode.min_link_job - 1 && mode1 < HintMode.max_link_job + 1,
        str: string | null | undefined;
    if (isUrl) {
      str = a.getUrlData_(link as HTMLAnchorElement);
      str.length > 7 && str.toLowerCase().startsWith("mailto:") && (str = str.slice(7).trimLeft());
    }
    /** Note: SVGElement::dataset is only since `BrowserVer.Min$SVGElement$$dataset` */
    else if ((str = Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.Min$SVGElement$$dataset
          ?  link.getAttribute("data-vim-text") : (link.dataset as NonNullable<typeof link.dataset>).vimText)
        && (str = str.trim())) { /* empty */ }
    else {
      const tag = VDom.htmlTag_(link);
      if (tag === "input") {
        let type = (link as HTMLInputElement).type, f: HTMLInputElement["files"];
        if (type === "password") {
          return VHud.tip_("Sorry, Vimium C won't copy a password.", 2000);
        }
        if (!VDom.uneditableInputs_[type]) {
          str = ((link as HTMLInputElement).value || (link as HTMLInputElement).placeholder).trim();
        } else if (type === "file") {
          str = (f = (link as HTMLInputElement).files) && f.length > 0 ? f[0].name : "";
        } else if ("button image submit reset".indexOf(type) >= 0) {
          str = (link as HTMLInputElement).value.trim();
        }
      } else {
        str = tag === "textarea" ? (link as HTMLTextAreaElement).value
          : tag === "select" ? ((link as HTMLSelectElement).selectedIndex < 0
              ? "" : (link as HTMLSelectElement).options[(link as HTMLSelectElement).selectedIndex].text)
          : tag && (str = (link as SafeHTMLElement).innerText.trim(),
              str.length > 7 && str.slice(0, 7).toLowerCase() === "mailto:" ? str.slice(7).trimLeft() : str)
            || (str = link.textContent.trim()) && str.replace(<RegExpG> /\s+/g, " ")
          ;
      }
      if (!str && tag) {
        str = ((link as SafeHTMLElement).title.trim() || link.getAttribute("aria-label") || "").trim();
      }
    }
    if (!str) {
      return VHud.copied_("", isUrl ? "url" : "");
    }
    if (mode1 > HintMode.min_edit - 1 && mode1 < HintMode.max_edit + 1) {
      let newtab = a.options_.newtab;
      newtab == null && (newtab = a.options_.force);
      // this frame is normal, so during Vomnibar.activate, checkHidden will only pass (in most cases)
      (VPort as ComplicatedVPort).post_<kFgReq.vomnibar, { c: number } & Partial<VomnibarNS.ContentOptions>>({
        H: kFgReq.vomnibar,
        c: 1,
        newtab: newtab != null ? !!newtab : !isUrl,
        url: str,
        keyword: (a.options_.keyword || "") + ""
      });
      return;
    } else if (mode1 === HintMode.SEARCH_TEXT) {
      return a.openUrl_(str);
    }
    // then mode1 can only be copy
    // NOTE: url should not be modified
    // although BackendUtils.convertToUrl does replace '\u3000' with ' '
    str = isUrl ? a.decodeURL_(str) : str;
    let shownText = str, lastYanked = a.yankedList_, oldCount = lastYanked ? lastYanked.split("\n").length : 0;
    if (mode1 & HintMode.list) {
      if (`\n${lastYanked}\n`.indexOf(`\n${str}\n`) >= 0) {
        return VHud.show_("Nothing new to copy");
      }
      shownText = `[${oldCount + 1}] ${str}`;
      str = oldCount ? lastYanked + "\n" + str + "\n" : str;
    }
    VPort.post_({
      H: kFgReq.copy,
      d: str
    });
    a.yankedList_ = str.trim();
    return VHud.copied_(shownText);
  }
  , HintMode.SEARCH_TEXT, "Search selected text"
  , HintMode.COPY_TEXT, "Copy link text to Clipboard"
  , HintMode.COPY_URL, "Copy link URL to Clipboard"
  , HintMode.SEARCH_TEXT | HintMode.queue, "Search link text one by one"
  , HintMode.COPY_TEXT | HintMode.queue, "Copy link text one by one"
  , HintMode.COPY_TEXT | HintMode.queue | HintMode.list, "Copy link text list"
  , HintMode.COPY_URL | HintMode.queue, "Copy link URL one by one"
  , HintMode.COPY_URL | HintMode.queue | HintMode.list, "Copy link URL list"
  , HintMode.EDIT_LINK_URL, "Edit link URL on Vomnibar"
  , HintMode.EDIT_TEXT, "Edit link text on Vomnibar"
] as HintsNS.ModeOpt,
[
  (link: HTMLAnchorElement): void => {
    const url = VHints.getUrlData_(link);
    if (!VPort.evalIfOK_(url)) {
      return VHints.openUrl_(url, true);
    }
  }
  , HintMode.OPEN_INCOGNITO_LINK, "Open link in incognito window"
  , HintMode.OPEN_INCOGNITO_LINK | HintMode.queue, "Open multiple incognito tabs"
] as HintsNS.ModeOpt,
[
  (element: SafeHTMLElement): void => {
    let tag = element.localName, text: string | void;
    if (tag === "video" || tag === "audio") {
      text = (element as HTMLImageElement).currentSrc || (element as HTMLImageElement).src;
    } else {
      text = VHints._getImageUrl(element);
    }
    if (!text) { return; }
    const url = text, i = text.indexOf("://"), a = VDom.createElement_("a");
    if (i > 0) {
      text = text.slice(text.indexOf("/", i + 4) + 1);
    }
    if (text.length > 40) {
      text = text.slice(0, 39) + "\u2026";
    }
    a.href = url;
    a.download = VHints.getImageName_(element) || "";
    // todo: how to trigger download
    VDom.mouse_(a, "click", [0, 0]);
    return VHud.tip_("Download: " + text, 2000);
  }
  , HintMode.DOWNLOAD_MEDIA, "Download media"
  , HintMode.DOWNLOAD_MEDIA | HintMode.queue, "Download multiple media"
] as HintsNS.ModeOpt,
[
  (img: SafeHTMLElement): void => {
    const a = VHints, text = a._getImageUrl(img, 1);
    if (!text) { return; }
    VPort.post_({
      H: kFgReq.openImage,
      r: a.mode_ & HintMode.queue ? ReuseType.newBg : ReuseType.newFg,
      f: a.getImageName_(img),
      u: text,
      a: a.options_.auto
    });
  }
  , HintMode.OPEN_IMAGE, "Open image"
  , HintMode.OPEN_IMAGE | HintMode.queue, "Open multiple images"
] as HintsNS.ModeOpt,
[
  (link: HTMLAnchorElement, rect): void => {
    let oldUrl: string | null = link.getAttribute("href"), changed = false;
    if (!oldUrl || oldUrl === "#") {
      let newUrl = link.dataset.vimUrl;
      if (newUrl && (newUrl = newUrl.trim())) {
        link.href = newUrl;
        changed = true;
      }
    }
    const kDownload = "download", hadNoDownload = !link.hasAttribute(kDownload);
    if (hadNoDownload) {
      link.download = "";
    }
    VDom.UI.click_(link, rect, {
      altKey_: true,
      ctrlKey_: false,
      metaKey_: false,
      shiftKey_: false
    });
    if (hadNoDownload) {
      link.removeAttribute(kDownload);
    }
    if (!changed) { /* empty */ }
    else if (oldUrl != null) {
      link.setAttribute("href", oldUrl);
    } else {
      link.removeAttribute("href");
    }
  }
  , HintMode.DOWNLOAD_LINK, "Download link"
  , HintMode.DOWNLOAD_LINK | HintMode.queue, "Download multiple links"
] as HintsNS.ModeOpt,
[
  (link, rect): void | false => {
    if (VHints.mode_ < HintMode.min_disable_queue) {
      VDom.view_(link);
      link.focus();
      VDom.UI.flash_(link);
    } else {
      VDom.UI.simulateSelect_(link, rect, true);
    }
    return false;
  }
  , HintMode.FOCUS, "Focus node"
  , HintMode.FOCUS | HintMode.queue, "Focus nodes continuously"
  , HintMode.FOCUS_EDITABLE, "Select an editable area"
] as HintsNS.ModeOpt,
[
  (link, rect, hint): void | boolean => {
    const a = VHints, tag = VDom.htmlTag_(link);
    if ((<RegExpOne> /^i?frame$/).test(tag)) {
      const highlight = link !== VOmni.box_;
      highlight ? a._highlightChild(link as HTMLIFrameElement | HTMLFrameElement) : VOmni.focus_();
      a.mode_ = HintMode.DEFAULT;
      return highlight;
    }
    const { UI } = VDom;
    if (tag === "details") {
      const summary = VDom.findMainSummary_(link as HTMLDetailsElement);
      if (summary) {
          // `HTMLSummaryElement::DefaultEventHandler(event)` in
          // https://cs.chromium.org/chromium/src/third_party/blink/renderer/core/html/html_summary_element.cc?l=109
          rect = (link as HTMLDetailsElement).open || !rect ? VDom.getVisibleClientRect_(summary) : rect;
          UI.click_(summary, rect, null, true);
          rect && UI.flash_(null, rect);
          return false;
      }
      (link as HTMLDetailsElement).open = !(link as HTMLDetailsElement).open;
      return;
    } else if (hint.refer_ && hint.refer_ === link) {
      return a.Modes_[0][0](link, rect, hint);
    } else if (VDom.getEditableType_<0>(link) >= EditableType.Editbox) {
      UI.simulateSelect_(link, rect, true);
      return false;
    }
    const mask = a.mode_ & HintMode.mask_focus_new, notMac = !VDom.cache_.m, newTab = mask > HintMode.newTab - 1,
    isRight = a.options_.button === "right";
    UI.click_(link, rect, {
      altKey_: false,
      ctrlKey_: newTab && notMac,
      metaKey_: newTab && !notMac,
      shiftKey_: mask > HintMode.mask_focus_new - 1
    }, mask > 0 || link.tabIndex >= 0
    , isRight ? 2 : 0
    , !(Build.BTypes & BrowserType.Chrome) || isRight || mask ? 0 : a.options_.touch);
  }
  , HintMode.OPEN_IN_CURRENT_TAB, "Open link in current tab"
  , HintMode.OPEN_IN_NEW_BG_TAB, "Open link in new tab"
  , HintMode.OPEN_IN_NEW_FG_TAB, "Open link in new active tab"
  , HintMode.OPEN_IN_CURRENT_TAB | HintMode.queue, "Open multiple links in current tab"
  , HintMode.OPEN_IN_NEW_BG_TAB | HintMode.queue, "Open multiple links in new tabs"
  , HintMode.OPEN_IN_NEW_FG_TAB | HintMode.queue, "Activate link and hold on"
] as HintsNS.ModeOpt
] as const
};
