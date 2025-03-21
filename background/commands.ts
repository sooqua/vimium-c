var Commands = {
  getOptions_ (item: string[], start: number): CommandsNS.Options | null {
    let opt: CommandsNS.RawOptions, i = start, len = item.length, ind: number, str: string | undefined, val: string;
    if (len <= i) { return null; }
    opt = BgUtils_.safeObj_();
    while (i < len) {
      str = item[i++];
      ind = str.indexOf("=");
      if (ind === 0 || str === "__proto__" || str[0] === "$") {
        this.logError_(ind === 0 ? "Missing" : "Unsupported", "option key:", str);
      } else if (ind < 0) {
        opt[str] = true;
      } else {
        val = str.slice(ind + 1);
        str = str.slice(0, ind);
        opt[str] = val && this.parseVal_(val);
      }
    }
    return str ? opt : null;
  },
  parseVal_ (val: string): any {
    try {
      return JSON.parse(val);
    } catch {}
    if (!val.startsWith('"')) { return val; }
    try {
      return JSON.parse(val);
    } catch {}
    return val;
  },
  makeCommand_ (command: string, options?: CommandsNS.RawOptions | null, details?: CommandsNS.Description
      ): CommandsNS.Item {
    let opt: CommandsNS.Options | null, help: CommandsNS.CustomHelpInfo | null = null;
    if (!details) { details = Commands.availableCommands_[command] as CommandsNS.Description; }
    opt = details.length < 4 ? null : BgUtils_.safer_(details[3] as NonNullable<CommandsNS.Description[3]>);
    if (options) {
      if ("count" in options) {
        options.count = details[0] === 1 ? 1 : (parseFloat(options.count) || 1) * (opt && opt.count || 1);
      }
      if (options.$desc || options.$key) {
        help = { key_: options.$key || "", desc_: options.$desc || "" };
        delete options.$key;
        delete options.$desc;
      }
      if (opt) {
        BgUtils_.extendIf_(options, opt);
      }
    } else {
      options = opt;
    }
    return {
      alias_: details[0] as Exclude<typeof details[0], kFgCmd>,
      background_: details[1] as Exclude<typeof details[1], 0>,
      command_: command,
      help_: help,
      options_: options,
      repeat_: details[2]
    };
  },
  parseKeyMappings_: (function (this: {}, line: string): void {
    let key: string | undefined, lines: string[], splitLine: string[], mk = 0, _i: number
      , _len: number, details: CommandsNS.Description | undefined, errors = 0, ch: number
      , registry = BgUtils_.safeObj_<CommandsNS.Item>()
      , cmdMap = BgUtils_.safeObj_<CommandsNS.Item>() as Partial<ShortcutInfoMap>
      , userDefinedKeys = BgUtils_.safeObj_<true>()
      , mkReg = BgUtils_.safeObj_<string>();
    const a = this as typeof Commands, available = a.availableCommands_;
    const colorRed = "color:red";
    lines = line.replace(<RegExpSearchable<0>> /\\\\?\n/g, t => t.length === 3 ? "\\\n" : ""
               ).replace(<RegExpG> /[\t ]+/g, " ").split("\n");
    if (lines[0] !== "unmapAll" && lines[0] !== "unmapall") {
      const defaultMap = a.defaultKeyMappings_;
      for (_i = defaultMap.length; 0 < _i; ) {
        _i -= 2;
        registry[defaultMap[_i]] = a.makeCommand_(defaultMap[_i + 1]);
      }
    } else {
      _i = 1;
    }
    for (_len = lines.length; _i < _len; _i++) {
      line = lines[_i].trim();
      if (!(line && line.charCodeAt(0) > kCharCode.maxCommentHead)) { continue; } // mask: /[!"#]/
      splitLine = line.split(" ");
      key = splitLine[0];
      if (key === "map") {
        key = BgUtils_.formatKeys_(splitLine[1] || "");
        if (!key || key === "__proto__") {
          a.logError_("Unsupported key sequence %c%s", colorRed, key || '""', `for "${splitLine[2] || ""}"`);
        } else if (key in userDefinedKeys) {
          a.logError_("Key %c%s", colorRed, key, "has been mapped to", (registry[key] as CommandsNS.Item).command_);
        } else if (splitLine.length < 3) {
          a.logError_("Lacking command when mapping %c%s", colorRed, key);
        } else if (!(details = available[splitLine[2]])) {
          a.logError_("Command %c%s", colorRed, splitLine[2], "doesn't exist!");
        } else if ((ch = key.charCodeAt(0)) > kCharCode.maxNotNum && ch < kCharCode.minNotNum
            || ch === kCharCode.dash) {
              a.logError_("Invalid key: %c%s", colorRed, key, "(the first char can not be '-' or number)");
        } else {
          registry[key] = a.makeCommand_(splitLine[2], a.getOptions_(splitLine, 3), details);
          userDefinedKeys[key] = true;
          continue;
        }
      } else if (key === "unmapAll" || key === "unmapall") {
        registry = BgUtils_.safeObj_();
        cmdMap = BgUtils_.safeObj_<CommandsNS.Item>() as Partial<ShortcutInfoMap>;
        userDefinedKeys = BgUtils_.safeObj_<true>();
        mkReg = BgUtils_.safeObj_<string>(), mk = 0;
        if (errors > 0) {
          a.logError_("All key mappings is unmapped, but there %s been %c%d error%s%c before this instruction"
            , errors > 1 ? "have" : "has", colorRed, errors, errors > 1 ? "s" : "", "color:auto");
        }
        continue;
      } else if (key === "mapkey" || key === "mapKey") {
        if (splitLine.length !== 3) {
          a.logError_(`MapKey needs ${splitLine.length > 3 ? "only" : "both"} source and target keys`, line);
        } else if ((key = splitLine[1]).length > 1 && (key.match(BgUtils_.keyRe_) as RegExpMatchArray).length > 1
          || splitLine[2].length > 1 && (splitLine[2].match(BgUtils_.keyRe_) as RegExpMatchArray).length > 1) {
          a.logError_("MapKey: a source / target key should be a single key:", line);
        } else if (key in mkReg) {
          a.logError_("This key %c%s", colorRed, key, "has been mapped to another key:", mkReg[key]);
        } else {
          mkReg[key === "<escape>" ? "<esc>" : key] = splitLine[2] === "<escape>" ? "<esc>" : splitLine[2];
          mk++;
          continue;
        }
      } else if (key === "shortcut" || key === "commmand") {
        key = splitLine[1];
        if (splitLine.length < 3) {
          a.logError_("Lacking command name and options in shortcut:", line);
        } else if ((Settings_.CONST_.GlobalCommands_ as Array<kShortcutNames | string>).indexOf(key) < 0) {
          a.logError_("Shortcut %c%s", colorRed, key, "doesn't exist!");
        } else if (key in cmdMap) {
          a.logError_("Shortcut %c%s", colorRed, key, "has been configured");
        } else {
          cmdMap[key as kShortcutNames] = a.makeCommand_(key, a.getOptions_(splitLine, 2));
          continue;
        }
      } else if (key !== "unmap") {
        a.logError_("Unknown mapping command: %c%s", colorRed, key, "in", line);
      } else if (splitLine.length !== 2) {
        a.logError_("Unmap needs one mapped key:", line);
      } else if ((key = BgUtils_.formatKeys_(splitLine[1])) in registry) {
        delete userDefinedKeys[key];
        delete registry[key];
        continue;
      } else {
        a.logError_("Unmapping: %c%s", colorRed, key, "has not been mapped");
      }
      ++errors;
    }
    for (key of Settings_.CONST_.GlobalCommands_) {
      if (!cmdMap[key as kShortcutNames]) {
        cmdMap[key as kShortcutNames] = a.makeCommand_(key);
      }
    }
    CommandsData_.keyToCommandRegistry_ = registry;
    CommandsData_.shortcutMap_ = cmdMap as ShortcutInfoMap;
    CommandsData_.mapKeyRegistry_ = mk > 0 ? mkReg : null;
    Settings_.temp_.cmdErrors_ = Settings_.temp_.cmdErrors_ > 0 ? ~errors : errors;
  }),
  populateCommandKeys_: (function (this: void, detectNewError: boolean): void {
    const d = CommandsData_, ref = d.keyMap_ = BgUtils_.safeObj_<ValidKeyAction | ChildKeyMap>(),
    keyRe = BgUtils_.keyRe_,
    d2 = Settings_.temp_, oldErrors = d2.cmdErrors_;
    if (oldErrors < 0) { d2.cmdErrors_ = ~oldErrors; }
    for (let ch = 10; 0 <= --ch; ) { ref[ch] = KeyAction.count; }
    ref["-"] = KeyAction.count;
    const C = Commands, R = d.keyToCommandRegistry_;
    for (const key in R) {
      const arr = key.match(keyRe) as RegExpMatchArray, last = arr.length - 1;
      if (last === 0) {
        (key in ref) && detectNewError && C.warnInactive_(ref[key] as ReadonlyChildKeyMap, key);
        ref[key] = KeyAction.cmd;
        continue;
      }
      let ref2 = ref as ChildKeyMap, tmp: ChildKeyMap | ValidChildKeyAction | undefined = ref2, j = 0;
      while ((tmp = ref2[arr[j]]) && j < last) { j++; ref2 = tmp; }
      if (tmp === KeyAction.cmd) {
        detectNewError && C.warnInactive_(key, arr.slice(0, j + 1).join(""));
        continue;
      }
      tmp != null && detectNewError && C.warnInactive_(tmp, key);
      while (j < last) { ref2 = ref2[arr[j++]] = BgUtils_.safeObj_() as ChildKeyMap; }
      ref2[arr[last]] = KeyAction.cmd;
    }
    if (detectNewError && d2.cmdErrors_) {
      console.log("%cKey Mappings: %o errors found.", "background-color:#fffbe5", d2.cmdErrors_);
    } else if (oldErrors < 0) {
      console.log("The new key mappings have no errors");
    }
    const maybePassed = Exclusions ? Exclusions.getAllPassed_() : null;
    const func = function (obj: ChildKeyMap): void {
      for (const key in obj) {
        const val = obj[key] as NonNullable<ChildKeyMap[string]>;
        if (val !== KeyAction.cmd) { func(val); }
        else if (maybePassed !== true && ref[key] === KeyAction.cmd && !(maybePassed && key in maybePassed)) {
          delete obj[key];
        }
      }
    };
    for (const key in ref) {
      const val = ref[key] as NonNullable<(typeof ref)[string]>;
      if (val !== KeyAction.cmd && val !== KeyAction.count) { func(val); }
    }
  }),
  logError_: function (): void {
    console.log.apply(console, arguments);
  } as (firstMsg: string, ...args: any[]) => void ,
  warnInactive_ (obj: ReadonlyChildKeyMap | string, newKey: string): void {
    console.log("inactive key:", obj, "with", newKey);
    ++Settings_.temp_.cmdErrors_;
  },
  execute_ (message: Partial<ExternalMsgs[kFgReq.command]["req"]> , sender: chrome.runtime.MessageSender
      , exec: (registryEntry: CommandsNS.Item, count: number, lastKey: kKeyCode, port: Port) => void
      ): void {
    let command = message.command;
    command = command ? command + "" : "";
    if (!(command && this.availableCommands_[command])) { return; }
    const port: Port | null = sender.tab ? Backend_.indexPorts_(sender.tab.id, sender.frameId || 0)
            || (Backend_.indexPorts_(sender.tab.id) || [null])[0] : null;
    let options = message.options as CommandsNS.RawOptions | null | undefined
      , lastKey: kKeyCode | undefined = message.key
      , count = message.count as number | string | undefined;
    count = count !== "-" ? parseInt(count as string, 10) || 1 : -1;
    options && typeof options === "object" ?
        BgUtils_.safer_(options) : (options = null);
    lastKey = 0 | <number> lastKey;
    return exec(this.makeCommand_(command, options), count, lastKey, port as Port);
  },

defaultKeyMappings_: [
  "?", "showHelp",
  "j", "scrollDown",
  "k", "scrollUp",
  "h", "scrollLeft",
  "l", "scrollRight",
  "gg", "scrollToTop",
  "G", "scrollToBottom",
  "zH", "scrollToLeft",
  "zL", "scrollToRight",
  "<c-e>", "scrollDown",
  "<c-y>", "scrollUp",
  "d", "scrollPageDown",
  "u", "scrollPageUp",
  "r", "reload",
  "gs", "toggleViewSource",
  "R", "reloadGivenTab",
  "<a-R>", "reopenTab",
  "<a-r>", "reloadTab",
  "<a-t>", "createTab",
  "<a-c>", "previousTab",
  "<a-C>", "nextTab",
  "<a-v>", "nextTab",
  "i", "enterInsertMode",
  "v", "enterVisualMode",
  "V", "enterVisualLineMode",
  "<f8>", "enterVisualMode",
  "H", "goBack",
  "L", "goForward",
  "gu", "goUp",
  "gU", "goToRoot",
  "gi", "focusInput",
  "f", "LinkHints.activate",
  "F", "LinkHints.activateModeToOpenInNewTab",
  "<a-f>", "LinkHints.activateModeWithQueue",
  "/", "enterFindMode",
  "n", "performFind",
  "N", "performBackwardsFind",
  "<a-n>", "performAnotherFind",
  "[[", "goPrevious",
  "]]", "goNext",
  "yy", "copyCurrentUrl",
  "yf", "LinkHints.activateModeToCopyLinkUrl",
  "p", "openCopiedUrlInCurrentTab",
  "P", "openCopiedUrlInNewTab",
  "K", "nextTab",
  "J", "previousTab",
  "gt", "nextTab",
  "gT", "previousTab",
  "^", "visitPreviousTab",
  "<<", "moveTabLeft",
  ">>", "moveTabRight",
  "g0", "firstTab",
  "g$", "lastTab",
  "W", "moveTabToNextWindow",
  "t", "createTab",
  "yt", "duplicateTab",
  "x", "removeTab",
  "X", "restoreTab",
  "<a-p>", "togglePinTab",
  "<a-m>", "toggleMuteTab",
  "o", "Vomnibar.activate",
  "O", "Vomnibar.activateInNewTab",
  "T", "Vomnibar.activateTabSelection",
  "b", "Vomnibar.activateBookmarks",
  "B", "Vomnibar.activateBookmarksInNewTab",
  "ge", "Vomnibar.activateUrl",
  "gE", "Vomnibar.activateUrlInNewTab",
  "gf", "nextFrame",
  "gF", "mainFrame",
  "gn", "toggleVomnibarStyle",
  "<f1>", "simBackspace",
  "<F1>", "switchFocus",
  "<f2>", "switchFocus",
  "m", "Marks.activateCreateMode",
  "`", "Marks.activate"
],
availableCommands_: { __proto__: null as never,
  "LinkHints.activate": [ kFgCmd.linkHints, 0, 0 ],
  "LinkHints.activateMode": [ kFgCmd.linkHints, 0, 0 ],
  "LinkHints.activateModeToCopyLinkText": [ kFgCmd.linkHints, 0, 0, { mode: HintMode.COPY_TEXT } ],
  "LinkHints.activateModeToCopyLinkUrl": [ kFgCmd.linkHints, 0, 0, { mode: HintMode.COPY_URL } ],
  "LinkHints.activateModeToDownloadImage": [ kFgCmd.linkHints, 0, 0, { mode: HintMode.DOWNLOAD_MEDIA } ],
  "LinkHints.activateModeToDownloadLink": [ kFgCmd.linkHints, 0, 0, { mode: HintMode.DOWNLOAD_LINK } ],
  "LinkHints.activateModeToEdit": [ kFgCmd.linkHints, 0, 1, { mode: HintMode.FOCUS_EDITABLE } ],
  "LinkHints.activateModeToHover": [ kFgCmd.linkHints, 0, 0, { mode: HintMode.HOVER } ],
  "LinkHints.activateModeToLeave": [ kFgCmd.linkHints, 0, 0, { mode: HintMode.LEAVE } ],
  "LinkHints.activateModeToOpenImage": [ kFgCmd.linkHints, 0, 0, { mode: HintMode.OPEN_IMAGE } ],
  "LinkHints.activateModeToOpenIncognito": [ kFgCmd.linkHints, 0, 0, { mode: HintMode.OPEN_INCOGNITO_LINK } ],
  "LinkHints.activateModeToOpenInNewForegroundTab": [ kFgCmd.linkHints, 0, 0, {mode: HintMode.OPEN_IN_NEW_FG_TAB} ],
  "LinkHints.activateModeToOpenInNewTab": [ kFgCmd.linkHints, 0, 0, { mode: HintMode.OPEN_IN_NEW_BG_TAB } ],
  "LinkHints.activateModeToOpenVomnibar": [ kFgCmd.linkHints, 0, 1, { mode: HintMode.EDIT_TEXT } ],
  "LinkHints.activateModeToSearchLinkText": [ kFgCmd.linkHints, 0, 0, { mode: HintMode.SEARCH_TEXT } ],
  "LinkHints.activateModeWithQueue": [ kFgCmd.linkHints, 0, 0, { mode: HintMode.OPEN_WITH_QUEUE } ],
  "LinkHints.unhoverLast": [ kFgCmd.unhoverLast, 0, 1 ],
  "Marks.activate": [ kFgCmd.marks, 0, 0 ],
  "Marks.activateCreateMode": [ kFgCmd.marks, 0, 0, { mode: "create" } ],
  "Marks.clearGlobal": [ kBgCmd.clearMarks, 1, 1 ],
  "Marks.clearLocal": [ kBgCmd.clearMarks, 1, 1, { local: true } ],
  "Vomnibar.activate": [ kBgCmd.showVomnibar, 1, 0 ],
  "Vomnibar.activateBookmarks": [ kBgCmd.showVomnibar, 1, 1, { mode: "bookm" } ],
  "Vomnibar.activateBookmarksInNewTab": [ kBgCmd.showVomnibar, 1, 1, { mode: "bookm", newtab: true } ],
  "Vomnibar.activateEditUrl": [ kBgCmd.showVomnibar, 1, 0, { url: true } ],
  "Vomnibar.activateEditUrlInNewTab": [ kBgCmd.showVomnibar, 1, 0, { url: true, newtab: true } ],
  "Vomnibar.activateHistory": [ kBgCmd.showVomnibar, 1, 1, { mode: "history" } ],
  "Vomnibar.activateHistoryInNewTab": [ kBgCmd.showVomnibar, 1, 1, { mode: "history", newtab: true } ],
  "Vomnibar.activateInNewTab": [ kBgCmd.showVomnibar, 1, 0, { newtab: true } ],
  "Vomnibar.activateTabSelection": [ kBgCmd.showVomnibar, 1, 1, { mode: "tab", newtab: true } ],
  "Vomnibar.activateUrl": [ kBgCmd.showVomnibar, 1, 0, { url: true } ],
  "Vomnibar.activateUrlInNewTab": [ kBgCmd.showVomnibar, 1, 0, { url: true, newtab: true } ],
  autoCopy: [ kFgCmd.autoCopy, 0, 1 ],
  autoOpen: [ kFgCmd.autoOpen, 0, 1 ],
  blank: [ kBgCmd.blank, 1, 1 ],
  clearCS: [ kBgCmd.clearCS, 1, 1, { type: "images" } ],
  clearFindHistory: [ kBgCmd.clearFindHistory, 1, 1 ],
  clearGlobalMarks: [ kBgCmd.clearMarks, 1, 1 ],
  closeOtherTabs: [ kBgCmd.removeTabsR, 1, 1, { other: true } ],
  closeTabsOnLeft: [ kBgCmd.removeTabsR, 1, 0, { count: -1 } ],
  closeTabsOnRight: [ kBgCmd.removeTabsR, 1, 0 ],
  copyCurrentTitle: [ kBgCmd.copyTabInfo, 1, 1, { type: "title" } ],
  copyCurrentUrl: [ kBgCmd.copyTabInfo, 1, 1 ],
  createTab: [ kBgCmd.createTab, 1, 20 as 0 ],
  debugBackground: [ kBgCmd.openUrl, 1, 1,
    {
      reuse: ReuseType.reuse,
      url: Build.BTypes & ~BrowserType.Chrome &&
            (!(Build.BTypes & BrowserType.Chrome) || OnOther !== BrowserType.Chrome)
        ? Build.BTypes & BrowserType.Firefox &&
            (!(Build.BTypes & ~BrowserType.Firefox) || OnOther === BrowserType.Firefox)
          ? "about:debugging#addons" : Settings_.CONST_.OptionsPage_
        : "chrome://extensions/?id=$id",
      id_mask: "$id"
    }],
  discardTab: [ kBgCmd.discardTab, 1, /* 20 in main.ts */ 0 ],
  duplicateTab: [ kBgCmd.duplicateTab, 1, 20 as 0 ],
  enableCSTemp: [ kBgCmd.toggleCS, 1, 0, { type: "images", incognito: true } ],
  enterFindMode: [ kBgCmd.performFind, 1, 1, {active: true, selected: true} ],
  enterInsertMode: [ kBgCmd.enterInsertMode, 1, 1 ],
  enterVisualLineMode: [ kBgCmd.enterVisualMode, 1, 1, { mode: "line" } ],
  enterVisualMode: [ kBgCmd.enterVisualMode, 1, 1 ],
  firstTab: [ kBgCmd.goTab, 1, 0, { absolute: true } ],
  focusInput: [ kFgCmd.focusInput, 0, 0 ],
  focusOrLaunch: [ kBgCmd.openUrl, 1, 1, { reuse: ReuseType.reuse } ],
  goBack: [ kFgCmd.framesGoBack, 0, 0, { count: -1 } ],
  goForward: [ kFgCmd.framesGoBack, 0, 0 ],
  goNext: [ kBgCmd.goNext, 1, 1 ],
  goPrevious: [ kBgCmd.goNext, 1, 1, { rel: "prev" } ],
  goToRoot: [ kBgCmd.goToRoot, 1, 0 ],
  goUp: [ kBgCmd.goUp, 1, 0 ],
  lastTab: [ kBgCmd.goTab, 1, 0, { count: -1, absolute: true } ],
  mainFrame: [ kBgCmd.mainFrame, 1, 1 ],
  moveTabLeft: [ kBgCmd.moveTab, 1, 0, { count: -1 } ],
  moveTabRight: [ kBgCmd.moveTab, 1, 0 ],
  moveTabToIncognito: [ kBgCmd.moveTabToNewWindow, 1, 1, { incognito: true } ],
  moveTabToNewWindow: [ kBgCmd.moveTabToNewWindow, 1, /** 30 in main.ts */ 0 ],
  moveTabToNextWindow: [ kBgCmd.moveTabToNextWindow, 1, 0 ],
  nextFrame: [ kBgCmd.nextFrame, 1, 0 ],
  nextTab: [ kBgCmd.goTab, 1, 0 ],
  openCopiedUrlInCurrentTab: [ kBgCmd.openUrl, 1, 1, { reuse: ReuseType.current, copied: true } ],
  openCopiedUrlInNewTab: [ kBgCmd.openUrl, 1, 20 as 0, {copied: true} ],
  openUrl: [ kBgCmd.openUrl, 1, 20 as 0 ],
  parentFrame: [ kBgCmd.parentFrame, 1, 0 ],
  passNextKey: [ kFgCmd.passNextKey, 0, 0 ],
  performAnotherFind: [ kBgCmd.performFind, 1, 0, { index: "other" } ],
  performBackwardsFind: [ kBgCmd.performFind, 1, 0, { count: -1 } ],
  performFind: [ kBgCmd.performFind, 1, 0 ],
  previousTab: [ kBgCmd.goTab, 1, 0, { count: -1 } ],
  quickNext: [ kBgCmd.goTab, 1, 0 ],
  reload: [ kFgCmd.reload, 0, 1 ],
  reloadGivenTab: [ kBgCmd.reloadGivenTab, 1, 0, { single: true } ],
  reloadTab: [ kBgCmd.reloadTab, 1, /** 20 in main.ts */ 0 ],
  removeRightTab: [ kBgCmd.removeRightTab, 1, 0 ],
  removeTab: [ kBgCmd.removeTab, 1, /** 20 in main.ts */ 0 ],
  reopenTab: [ kBgCmd.reopenTab, 1, 1 ],
  restoreGivenTab: [ kBgCmd.restoreGivenTab, 1, 0 ],
  restoreTab: [ kBgCmd.restoreTab, 1, 25 as 0 ],
  scrollDown: [ kFgCmd.scroll, 0, 0 ],
  scrollFullPageDown: [ kFgCmd.scroll, 0, 0, { view: 2 } ],
  scrollFullPageUp: [ kFgCmd.scroll, 0, 0, { count: -1, view: 2 } ],
  scrollLeft: [ kFgCmd.scroll, 0, 0, { count: -1, axis: "x" } ],
  scrollPageDown: [ kFgCmd.scroll, 0, 0, { dir: 0.5, view: 2 } ],
  scrollPageUp: [ kFgCmd.scroll, 0, 0, { dir: -0.5, view: 2 } ],
  scrollPxDown: [ kFgCmd.scroll, 0, 0, { view: 1 } ],
  scrollPxLeft: [ kFgCmd.scroll, 0, 0, { count: -1, axis: "x", view: 1 } ],
  scrollPxRight: [ kFgCmd.scroll, 0, 0, { axis: "x", view: 1 } ],
  scrollPxUp: [ kFgCmd.scroll, 0, 0, { count: -1, view: 1 } ],
  scrollRight: [ kFgCmd.scroll, 0, 0, { axis: "x" } ],
  scrollTo: [ kFgCmd.scroll, 0, 0, { dest: "min" } ],
  scrollToBottom: [ kFgCmd.scroll, 0, 0, { dest: "max" } ],
  scrollToLeft: [ kFgCmd.scroll, 0, 0, { axis: "x", dest: "min" } ],
  scrollToRight: [ kFgCmd.scroll, 0, 0, { axis: "x", dest: "max" } ],
  scrollToTop: [ kFgCmd.scroll, 0, 0, { dest: "min" } ],
  scrollUp: [ kFgCmd.scroll, 0, 0, { count: -1 } ],
  searchAs: [ kFgCmd.searchAs, 0, 1, { copied: true, selected: true } ],
  searchInAnother: [ kBgCmd.searchInAnother, 1, 1 ],
  showHelp: [ kBgCmd.showHelp, 1, 1 ],
  simBackspace: [ kFgCmd.switchFocus, 0, 1, { act: "backspace" } ],
  switchFocus: [ kFgCmd.switchFocus, 0, 1 ],
  toggleCS: [ kBgCmd.toggleCS, 1, 0, { type: "images" } ],
  toggleLinkHintCharacters: [ kBgCmd.toggle, 1, 1, { key: "linkHintCharacters" } ],
  toggleMuteTab: [ kBgCmd.toggleMuteTab, 1, 1 ],
  togglePinTab: [ kBgCmd.togglePinTab, 1, /** 30 in main.ts */ 0 ],
  toggleSwitchTemp: [ kBgCmd.toggle, 1, 1 ],
  toggleViewSource: [ kBgCmd.toggleViewSource, 1, 1 ],
  toggleVomnibarStyle: [ kBgCmd.toggleVomnibarStyle, 1, 1, { style: "dark" } ],
  closeDownloadBar: [ kBgCmd.moveTabToNewWindow, 1, 1, { all: 1 } ],
  visitPreviousTab: [ kBgCmd.visitPreviousTab, 1, 0 ]
} as ReadonlySafeDict<CommandsNS.Description>
},
CommandsData_: CommandsDataTy = CommandsData_ as never || {
  cmdDescriptions_: {
    __proto__: null as never,
    createTab: "Create new tab(s)",
    discardTab: "Discard some other tab(s)",
    duplicateTab: "Duplicate current tab for N times",
    moveTabToNewWindow: "Move N tab(s) to new window (use limited=null/&lt;boolean&gt;)",
    openCopiedUrlInNewTab: "Open the clipboard's URL in N new tab(s)",
    openUrl: 'open URL (use url="", urls:string[], reuse=-1/0/1/-2, incognito, window, end)',
    reloadTab: "Reload N tab(s) (use hard, bypassCache)",
    removeTab: 'Close N tab(s) (use allow_close, goto=""/left/right/previous)',
    restoreTab: "Restore closed tab(s)",
    togglePinTab: "Pin or unpin N tab(s)",
  },
  keyToCommandRegistry_: null as never as SafeDict<CommandsNS.Item>,
  keyMap_: null as never as KeyMap,
  shortcutMap_: null as never as ShortcutInfoMap,
  mapKeyRegistry_: null as SafeDict<string> | null
};

if (!Build.NDEBUG) {
  (Commands.availableCommands_ as Writable<typeof Commands.availableCommands_>).focusOptions = [
    kBgCmd.openUrl, 1, 1, { reuse: ReuseType.reuse, url: "vimium://options" }
  ];
  Commands.defaultKeyMappings_.push("<a-s-f12>", "debugBackground", "<s-f12>", "focusOptions");
}
if (Backend_.onInit_) {
  Commands.parseKeyMappings_(Settings_.get_("keyMappings"));
  Commands.populateCommandKeys_(true);
  if (!Settings_.get_("vimSync") && !Settings_.temp_.hasEmptyLocalStorage_) {
    Commands = null as never;
  }
  Build.BTypes & BrowserType.Edge && !chrome.commands ||
  (chrome.commands.onCommand as chrome.events.Event<
        (command: kShortcutNames | kShortcutAliases & string, exArg: FakeArg) => void
      >).addListener(Backend_.ExecuteShortcut_);
}
if (Commands) {
Settings_.updateHooks_.keyMappings = function (this: {}, value: string | null): void {
  value != null && Commands.parseKeyMappings_(value);
  Commands.populateCommandKeys_(value != null);
  return (this as typeof Settings_).broadcast_({
    N: kBgReq.keyMap,
    m: CommandsData_.mapKeyRegistry_,
    k: CommandsData_.keyMap_
  });
};
}
