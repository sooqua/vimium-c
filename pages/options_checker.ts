let keyMappingChecker_ = {
  normalizeKeys_: null as never as (this: void, s: string) => string,
  init_ (): void {
    const keyLeftRe = <RegExpG & RegExpSearchable<2>> /<(?!<)((?:[ACMSacms]-){0,4})(.[^>]*)>/g;
    function sortModifiers(option: string) {
      return option.length < 4 ? option : option.length > 6 ? "a-c-m-s-"
        : option.slice(0, -1).split("-").sort().join("-") + "-";
    }
    function func(_0: string, oldModifiers: string, ch: string): string {
      let modifiers = oldModifiers.toLowerCase();
      const isLong = ch.length > 1, hasShift = modifiers.indexOf("s-") >= 0, chUpper = ch.toUpperCase();
      if (!isLong) {
        if (!modifiers) { return _0; }
        if (hasShift && modifiers.length < 3) { return chUpper; }
      }
      const chLower = ch.toLowerCase();
      modifiers = sortModifiers(modifiers);
      ch !== chLower && !hasShift && (modifiers += "s-");
      return modifiers || isLong ? `<${modifiers}${chLower}>` : ch;
    }
    this.normalizeKeys_ = keys => keys.replace(keyLeftRe, func);
    this.normalizeMap_ = this.normalizeMap_.bind(this);
    this.normalizeCmd_ = this.normalizeCmd_.bind(this);
    this.normalizeOptions_ = this.normalizeOptions_.bind(this);
    this.init_ = null as never;
  },
  hexCharRe_: <RegExpGI & RegExpSearchable<1>> /\\(?:x([\da-z]{2})|\\)/gi,
  onHex_ (this: void, _s: string, hex: string): string {
    return hex ? "\\u00" + hex : "\\\\";
  },
  normalizeOptions_ (str: string, value: string, s2: string | undefined, tail: string): string {
    if (s2) {
      s2 = s2.replace(this.hexCharRe_, this.onHex_);
      value = `"${s2}"`;
    } else if (!tail && value === "\\\\") {
      value = '\\';
    }
    try {
      const obj = JSON.parse(value);
      if (typeof obj !== "string") {
        return obj !== true ? str : "";
      }
      value = obj;
    } catch {
      s2 && (value = s2);
    }
    value = value && JSON.stringify(value).replace(this.toHexCharRe_, this.onToHex_);
    return "=" + value + tail;
  },
  optionValueRe_: <RegExpG & RegExpSearchable<3>> /=("(\S*(?:\s[^=]*)?)"|\S+)(\s|$)/g,
  toHexCharRe_: <RegExpG & RegExpSearchable<0>> /\s/g,
  onToHex_ (this: void, s: string): string {
    const hex = s.charCodeAt(0) + 0x100000;
    return "\\u" + hex.toString(16).slice(2);
  },
  normalizeMap_ (_0: string, cmd: string, keys: string, options: string) {
    const keys2 = this.normalizeKeys_(keys);
    if (keys2 !== keys) {
      console.log("KeyMappings Checker:", keys, "is corrected into", keys2);
      keys = keys2;
    }
    options = options ? options.replace(this.optionValueRe_, this.normalizeOptions_) : "";
    return cmd + keys + options;
  },
  normalizeCmd_ (_0: string, cmd: string, name: string, options: string) {
    options = options ? options.replace(this.optionValueRe_, this.normalizeOptions_) : "";
    return cmd + name + options;
  },
  mapKeyRe_: <RegExpG & RegExpSearchable<3>> /(\n[ \t]*#?(?:un)?map\s+)(\S+)([^\n]*)/g,
  cmdKeyRe_: <RegExpG & RegExpSearchable<3>> /(\n[ \t]*#?(?:command|shortcut)\s+)(\S+)([^\n]*)/g,
  wrapLineRe_: <RegExpG & RegExpSearchable<0>> /\\\\?\n/g,
  wrapLineRe2_: <RegExpG & RegExpSearchable<0>> /\\\r/g,
  check_ (str: string): string {
    if (!str) { return str; }
    this.init_ && this.init_();
    str = "\n" + str.replace(this.wrapLineRe_, i => i.length === 3 ? i : "\\\r");
    str = str.replace(this.mapKeyRe_, this.normalizeMap_);
    str = str.replace(this.cmdKeyRe_, this.normalizeCmd_);
    str = str.replace(this.wrapLineRe2_, "\\\n").trim();
    return str;
  },
};
Option_.all_.keyMappings.checker_ = keyMappingChecker_;
keyMappingChecker_ = null as never;

Option_.all_.searchUrl.checker_ = {
  check_ (str: string): string {
    const map = Object.create<Search.RawEngine>(null);
    BG_.BgUtils_.parseSearchEngines_("k:" + str, map);
    const obj = map.k;
    if (obj == null) {
      return bgSettings_.get_("searchUrl", true);
    }
    let str2 = BG_.BgUtils_.convertToUrl_(obj.url_, null, Urls.WorkType.KeepAll);
    if (BG_.BgUtils_.lastUrlType_ > Urls.Type.MaxOfInputIsPlainUrl) {
      const err = `The value "${obj.url_}" is not a valid plain URL.`;
      console.log("searchUrl checker:", err);
      Option_.all_.searchUrl.showError_(err);
      return bgSettings_.get_("searchUrl", true);
    }
    str2 = str2.replace(BG_.BgUtils_.spacesRe_, "%20");
    if (obj.name_ && obj.name_ !== "k") { str2 += " " + obj.name_; }
    Option_.all_.searchUrl.showError_("");
    return str2;
  }
};

Option_.all_.vimSync.allowToSave_ = function (): boolean {
  const newlyEnableSyncing = !this.saved_ && this.readValueFromElement_() === true;
  if (newlyEnableSyncing) {
    const arr = Option_.all_;
    let delta = 0;
    for (const i in arr) {
      arr[i as keyof AllowedOptions].saved_ || ++delta;
    }
    let tooMany = delta > 1;
    setTimeout(alert, 100, tooMany ?
`        Error:
Sorry, but you're enabling the "Sync settings" option
    while some other options are also modified.
Please only perform one action at a time!`
      :
`        Warning:
the current settings will be OVERRIDDEN the next time Vimium C starts!
Please back up your settings using the "Export Settings" button
!!!        RIGHT NOW        !!!`
    );
    if (tooMany) {
      return false;
    }
  }
  return true;
};

Option_.all_.keyboard.checker_ = {
  check_ (data: AllowedOptions["keyboard"]): AllowedOptions["keyboard"] {
    if (data == null || data.length !== 2 || !(data[0] > 0 && data[0] < 4000) || !(data[1] > 0 && data[1] < 1000)) {
      return bgSettings_.defaults_.keyboard;
    }
    return [+data[0], data[1]];
  }
};

(function (): void {
  const func = loadChecker, info = (loadChecker as CheckerLoader).info_;
  (loadChecker as CheckerLoader).info_ = "";
  let _ref = $$("[data-check]"), _i: number;
  for (_i = _ref.length; 0 <= --_i; ) {
    const element = _ref[_i];
    element.removeEventListener(element.dataset.check || "input", func);
  }

  if (info === "keyMappings") { return ReloadCommands(); }
  Option_.all_.keyMappings.element_.addEventListener("input", ReloadCommands);
  function ReloadCommands(this: HTMLElement | void, event?: Event): void {
    BG_.Commands || BG_.BgUtils_.require_("Commands");
    if (!event) { return; }
    (this as HTMLElement).removeEventListener("input", ReloadCommands);
  }
})();
