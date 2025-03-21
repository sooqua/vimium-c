/// <reference path="../content/base.d.ts" />
/// <reference path="../background/bg.d.ts" />
/// <reference path="../background/utils.ts" />
/// <reference path="../background/settings.ts" />
/// <reference path="../background/exclusions.ts" />
type AllowedOptions = SettingsNS.PersistentSettings;
type PossibleOptionNames<T> = PossibleKeys<AllowedOptions, T>;
interface BaseChecker<V extends AllowedOptions[keyof AllowedOptions]> {
  init_? (): any;
  check_ (value: V): V;
}
type Checker<T extends keyof AllowedOptions> = BaseChecker<AllowedOptions[T]>;
interface BgWindow extends Window {
  BgUtils_: typeof BgUtils_;
  Settings_: typeof Settings_;
}

if (!(Build.BTypes & ~BrowserType.Chrome) ? false : !(Build.BTypes & BrowserType.Chrome) ? true
    : typeof browser !== "undefined" && (browser && (browser as typeof chrome).runtime) != null) {
  window.chrome = browser as typeof chrome;
}
const KeyRe_ = <RegExpG> /<(?!<)(?:a-)?(?:c-)?(?:m-)?(?:s-)?(?:[a-z][\da-z]+|[^\sA-Z])>|\S/g,
__extends = function<Child, Super, Base> (
    child: (new <Args extends any[]> (...args: Args) => Child) & {
        prototype?: Super & { "constructor": new () => Child }
    }, parent: (new <Args extends any[]> (...args: Args) => Super) & {
        prototype: Base & { "constructor": new () => Super }
    }): void {
  interface Middle {
    prototype?: Base & { "constructor": new () => Super };
    new (): Super & { "constructor": new () => Child };
  }
  const __: Middle = function (this: Super & { "constructor": new () => Child }): void {
    this.constructor = child;
  } as {} as Middle;
  __.prototype = parent.prototype;
  child.prototype = new __();
},
nextTick_ = (function (): {<T>(task: (self: T) => void, context: T): void; (task: (this: void) => void): void; } {
  type Callback = () => void;
  const tasks: Callback[] = [],
  ticked = function (): void {
    const oldSize = tasks.length;
    for (const task of tasks) {
      task();
    }
    if (tasks.length > oldSize) {
      tasks.splice(0, oldSize);
      Promise.resolve(1).then(ticked);
    } else {
      tasks.length = 0;
    }
  };
  return function <T> (task: ((self: T) => void) | ((this: void) => void), context?: T): void {
    if (tasks.length <= 0) {
      Promise.resolve(1).then(ticked);
    }
    if (context as unknown as number === 9) {
      // here ignores the case of re-entry
      tasks.unshift(task as (this: void) => void);
    } else {
      tasks.push(context ? task.bind(null, context) : task as (this: void) => void);
    }
  };
})(),
debounce_ = function<T> (this: void, func: (this: T) => void
    , wait: number, bound_context: T, also_immediate: number
    ): (this: void) => void {
  let timeout = 0, timestamp: number;
  const later = function () {
    const last = Date.now() - timestamp; // safe for time changes
    if (last < wait - /* for resolution tolerance */ 4 && last >= 0) {
      timeout = setTimeout(later, wait - last);
      return;
    }
    timeout = 0;
    if (timestamp !== also_immediate) {
      return func.call(bound_context);
    }
  };
  also_immediate = also_immediate ? 1 : 0;
  return function () {
    timestamp = Date.now(); // safe for time changes
    if (timeout) { return; }
    timeout = setTimeout(later, wait);
    if (also_immediate) {
      also_immediate = timestamp;
      return func.call(bound_context);
    }
  };
} as <T> (this: void, func: (this: T) => void
          , wait: number, bound_context: T, also_immediate: BOOL
          ) => (this: void) => void;

var $ = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T
  , BG_ = chrome.extension.getBackgroundPage() as Window as BgWindow;
let bgSettings_ = BG_.Settings_;
declare var bgOnOther_: BrowserType;
const bgBrowserVer_ = Build.BTypes & BrowserType.Chrome ? BG_.CurCVer_ : BrowserVer.assumedVer;
if (Build.BTypes & ~BrowserType.Chrome && Build.BTypes & ~BrowserType.Firefox && Build.BTypes & ~BrowserType.Edge) {
  var bgOnOther_ = BG_.OnOther as NonNullable<typeof BG_.OnOther>;
}

abstract class Option_<T extends keyof AllowedOptions> {
  readonly element_: HTMLElement;
  readonly field_: T;
  previous_: AllowedOptions[T];
  saved_: boolean;
  locked_?: boolean;
  readonly onUpdated_: (this: void) => void;
  onSave_ (): void { /* empty */ }
  checker_?: Checker<T>;

  static all_ = Object.create(null) as {
    [T in keyof AllowedOptions]: Option_<T>;
  } & SafeObject;
  static syncToFrontend_: Array<keyof SettingsNS.FrontendSettings>;
  static suppressPopulate_ = true;

constructor (element: HTMLElement, onUpdated: (this: Option_<T>) => void) {
  this.element_ = element;
  this.field_ = element.id as T;
  this.previous_ = this.onUpdated_ = null as never;
  this.saved_ = false;
  if (this.field_ in bgSettings_.valuesToLoad_) {
    onUpdated = this._onCacheUpdated.bind(this, onUpdated);
  }
  this.onUpdated_ = debounce_(onUpdated, 330, this, 1);
}

fetch_ (): void {
  this.saved_ = true;
  this.previous_ = bgSettings_.get_(this.field_);
  if (!Option_.suppressPopulate_) {
    this.populateElement_(this.previous_);
  }
}
normalize_ (value: AllowedOptions[T], isJSON: boolean, str?: string): AllowedOptions[T] {
  const checker = this.checker_;
  if (isJSON) {
    str = checker || !str ? JSON.stringify(checker ? checker.check_(value) : value) : str;
    return BG_.JSON.parse(str);
  }
  return checker ? checker.check_(value) : value;
}
allowToSave_ (): boolean { return true; }
save_ (): void {
  let value = this.readValueFromElement_(), isJSON = typeof value === "object"
    , previous = isJSON ? JSON.stringify(this.previous_) : this.previous_
    , pod = isJSON ? JSON.stringify(value) : value;
  if (pod === previous) { return; }
  previous = pod;
  value = this.normalize_(value, isJSON, isJSON ? pod as string : "");
  if (isJSON) {
    pod = JSON.stringify(value);
    if (pod === JSON.stringify(bgSettings_.defaults_[this.field_])) {
      value = bgSettings_.defaults_[this.field_];
    }
  }
  bgSettings_.set_<keyof AllowedOptions>(this.field_, value);
  this.previous_ = value = bgSettings_.get_(this.field_);
  this.saved_ = true;
  if (previous !== (isJSON ? JSON.stringify(value) : value)) {
    this.populateElement_(value, true);
  }
  if (this.field_ in bgSettings_.valuesToLoad_) {
    Option_.syncToFrontend_.push(this.field_ as keyof SettingsNS.FrontendSettings);
  }
  this.onSave_();
}
abstract readValueFromElement_ (): AllowedOptions[T];
abstract populateElement_ (value: AllowedOptions[T], enableUndo?: boolean): void;
_onCacheUpdated: (this: Option_<T>, onUpdated: (this: Option_<T>) => void) => void;
areEqual_: (this: Option_<T>, a: AllowedOptions[T], b: AllowedOptions[T]) => boolean;
atomicUpdate_: (this: Option_<T> & {element_: TextElement}, value: string, undo: boolean, locked: boolean) => void;

static areJSONEqual_ (this: void, a: object, b: object): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
static saveOptions_: (this: void) => boolean;
static needSaveOptions_: (this: void) => boolean;
showError_: (msg: string, tag?: OptionErrorType | null, errors?: boolean) => void;
}
type OptionErrorType = "has-error" | "highlight";

interface ExclusionBaseVirtualNode {
  rule_: ExclusionsNS.StoredRule;
  changed_: boolean;
  visible_: boolean;
}
interface ExclusionInvisibleVirtualNode extends ExclusionBaseVirtualNode {
  changed_: false;
  visible_: false;
  $pattern_: null;
  $keys_: null;
}
interface ExclusionVisibleVirtualNode extends ExclusionBaseVirtualNode {
  rule_: ExclusionsNS.StoredRule;
  changed_: boolean;
  visible_: true;
  $pattern_: HTMLInputElement & ExclusionRealNode;
  $keys_: HTMLInputElement & ExclusionRealNode;
}
interface ExclusionRealNode extends HTMLElement {
  vnode: ExclusionVisibleVirtualNode;
}

class ExclusionRulesOption_ extends Option_<"exclusionRules"> {
  template_: HTMLTableRowElement;
  list_: Array<ExclusionVisibleVirtualNode | ExclusionInvisibleVirtualNode>;
  $list_: HTMLTableSectionElement;
  inited_: boolean;
constructor (element: HTMLElement, onUpdated: (this: ExclusionRulesOption_) => void) {
  super(element, onUpdated);
  this.inited_ = false;
  bgSettings_.fetchFile_("exclusionTemplate", (): void => {
    const container = document.createElement("div");
    if (Build.BTypes & ~BrowserType.Firefox) {
      container.innerHTML = bgSettings_.cache_.exclusionTemplate as string;
    } else {
      const parsed = new DOMParser().parseFromString(bgSettings_.cache_.exclusionTemplate as string, "text/html").body;
      (container as Ensure<typeof element, "append">).append(... <Element[]> <ArrayLike<Element>> parsed.children);
    }
    this.template_ = (container.querySelector("#exclusionRuleTemplate") as HTMLTemplateElement
        ).content.firstChild as HTMLTableRowElement;
    this.$list_ = container.querySelector("tbody") as HTMLTableSectionElement;
    this.list_ = [];
    this.$list_.addEventListener("input", ExclusionRulesOption_.MarkChanged_);
    this.$list_.addEventListener("input", this.onUpdated_);
    this.$list_.addEventListener("click", e => this.onRemoveRow_(e));
    $("#exclusionAddButton").onclick = () => this.addRule_("");
    let table = container.firstElementChild as HTMLElement;
    table.remove();
    this.template_.remove();
    this.inited_ = true;
    if (this.saved_) { // async and .fetch called
      nextTick_(() => this.populateElement_(this.previous_));
    }
    nextTick_(table1 => this.element_.appendChild(table1), table);
  });
}
onRowChange_ (_isInc: number): void { /* empty */ }
static MarkChanged_ (this: void, event: Event): void {
  const vnode = (event.target as HTMLInputElement & Partial<ExclusionRealNode>).vnode;
  vnode && (vnode.changed_ = true);
}
addRule_ (pattern: string, autoFocus?: false | undefined): void {
  this.appendRuleTo_(this.$list_, {
    pattern,
    passKeys: ""
  });
  const item = this.list_[this.list_.length - 1] as ExclusionVisibleVirtualNode;
  if (autoFocus !== false) {
    nextTick_(() => item.$pattern_.focus());
  }
  if (pattern) {
    this.onUpdated_();
  }
  this.onRowChange_(1);
}
populateElement_ (rules: ExclusionsNS.StoredRule[]): void {
  if (!this.inited_) { return; }
  this.$list_.textContent = "";
  this.list_ = [];
  if (rules.length <= 0) { /* empty */ }
  else if (rules.length === 1) {
    this.appendRuleTo_(this.$list_, rules[0]);
  } else {
    const frag = document.createDocumentFragment();
    rules.forEach(this.appendRuleTo_.bind(this, frag));
    this.$list_.appendChild(frag);
  }
  return this.onRowChange_(rules.length);
}
isPatternMatched_ (_pattern: string) { return true; }
appendRuleTo_ (list: HTMLTableSectionElement | DocumentFragment, { pattern, passKeys }: ExclusionsNS.StoredRule): void {
  const vnode: ExclusionVisibleVirtualNode | ExclusionInvisibleVirtualNode = {
    // rebuild a rule, to ensure a consistent memory layout
    rule_: { pattern, passKeys },
    changed_: false,
    visible_: false,
    $pattern_: null,
    $keys_: null,
  };
  if (!this.isPatternMatched_(pattern)) {
    this.list_.push(vnode);
    return;
  }
  const row = document.importNode(this.template_, true),
  patternEl = row.querySelector(".pattern") as HTMLInputElement & ExclusionRealNode,
  passKeysEl = row.querySelector(".passKeys") as HTMLInputElement & ExclusionRealNode,
  trimedKeys = passKeys.trimRight();
  patternEl.value = pattern;
  if (pattern) {
    patternEl.placeholder = "";
  }
  passKeysEl.value = trimedKeys;
  if (trimedKeys) {
    passKeysEl.placeholder = "";
  }
  const vnode2 = vnode as ExclusionVisibleVirtualNode | ExclusionInvisibleVirtualNode as ExclusionVisibleVirtualNode;
  vnode2.visible_ = true;
  vnode2.$pattern_ = patternEl; vnode2.$keys_ = passKeysEl;
  patternEl.vnode = vnode2;
  passKeysEl.vnode = vnode2;
  this.list_.push(vnode2);
  list.appendChild(row);
}
static OnNewKeys_ (vnode: ExclusionVisibleVirtualNode): void {
  if (vnode.rule_.pattern && vnode.$keys_.placeholder) {
    vnode.$keys_.placeholder = "";
  }
}
onRemoveRow_ (event: Event): void {
  let element = event.target as HTMLElement;
  if (!element.classList.contains("exclusionRemoveButton")) { return; }
  element = (element.parentNode as Node).parentNode as HTMLElement;
  if (element.classList.contains("exclusionRuleInstance")) {
    const vnode = (element.querySelector(".pattern") as ExclusionRealNode).vnode;
    element.remove();
    this.list_.splice(this.list_.indexOf(vnode), 1);
    this.onUpdated_();
    return this.onRowChange_(0);
  }
}

_reChar: RegExpOne;
_escapeRe: RegExpG;
readValueFromElement_ (part?: boolean): AllowedOptions["exclusionRules"] {
  const rules: ExclusionsNS.StoredRule[] = [];
  part = (part === true);
  for (const vnode of this.list_) {
    if (part && !vnode.visible_) {
      continue;
    }
    if (!vnode.changed_) {
      if (vnode.rule_.pattern) {
        rules.push(vnode.rule_);
      }
      continue;
    }
    let pattern = vnode.$pattern_.value.trim();
    let fixTail = false, passKeys = vnode.$keys_.value;
    if (!pattern) {
      this.updateVNode_(vnode, "", passKeys);
      continue;
    }
    if (pattern[0] === ":") { /* empty */ }
    else if (!this._reChar.test(pattern)) {
      fixTail = pattern.indexOf("/", pattern.indexOf("://") + 3) < 0;
      pattern = pattern.replace(this._escapeRe, "$1");
      pattern = (pattern.indexOf("://") === -1 ? ":http://" : ":") + pattern;
    } else if (pattern[0] !== "^") {
      fixTail = pattern.indexOf("/", pattern.indexOf("://") + 3) < 0;
      pattern = (pattern.indexOf("://") === -1 ? "^https?://" : "^") +
          (pattern[0] !== "*" || pattern[1] === "."
            ? ((pattern = pattern.replace(<RegExpG> /\./g, "\\.")),
              pattern[0] !== "*" ? pattern.replace("://*\\.", "://(?:[^./]+\\.)*?")
                : pattern.replace("*\\.", "(?:[^./]+\\.)*?"))
            : "[^/]" + pattern);
    }
    if (fixTail) {
      pattern += "/";
    }
    if (passKeys) {
      passKeys = BG_.BgUtils_.formatKeys_(passKeys);
      const passArr = passKeys.match(KeyRe_);
      if (passArr) {
        const isReverted = passArr[0] === "^" && passArr.length > 1;
        isReverted && passArr.shift();
        passArr.sort();
        isReverted ? passArr.unshift("^") : passArr[0] === "^" && (passArr.shift(), passArr.push("^"));
      }
      passKeys = passArr ? (passArr.join(" ") + " ") : "";
      passKeys = passKeys.replace(<RegExpG> /<escape>/gi, "<esc>");
    }
    let tip = passKeys ? passKeys.length > 1 && passKeys[0] === "^" ? "only hook such keys" : "pass through such keys"
              : "completely disabled";
    vnode.$keys_.title !== tip && (vnode.$keys_.title = tip);
    this.updateVNode_(vnode, pattern, passKeys);
    rules.push(vnode.rule_);
  }
  return rules;
}
updateVNode_ (vnode: ExclusionVisibleVirtualNode, pattern: string, keys: string) {
  const hasNewKeys = !vnode.rule_.passKeys && !!keys;
  vnode.rule_ = { pattern, passKeys: keys };
  vnode.changed_ = false;
  if (hasNewKeys) {
    ExclusionRulesOption_.OnNewKeys_(vnode);
  }
}
onSave_ (): void {
  for (let rule of this.list_) {
    if (!rule.visible_) { continue; }
    if (rule.$pattern_.value !== rule.rule_.pattern) {
      rule.$pattern_.value = rule.rule_.pattern;
    }
    if (rule.$keys_.value !== rule.rule_.passKeys) {
      rule.$keys_.value = rule.rule_.passKeys;
    }
  }
}

readonly areEqual_ = Option_.areJSONEqual_;
sortRules_: (el?: HTMLElement) => void;
timer_?: number;
}
ExclusionRulesOption_.prototype._reChar = <RegExpOne> /^[\^*]|[^\\][$()*+?\[\]{|}]/;
ExclusionRulesOption_.prototype._escapeRe = <RegExpG> /\\(.)/g;

location.pathname.toLowerCase().indexOf("/popup.html") !== -1 &&
BG_.BgUtils_.require_("Exclusions").then((function (callback) {
  return function () {
    chrome.tabs.query({currentWindow: true as true, active: true as true}, callback);
  };
})(function (activeTabs: [chrome.tabs.Tab] | never[]): void {
  const curTab = activeTabs[0];
  let ref = BG_.Backend_.indexPorts_(curTab.id), blockedMsg = $("#blocked-msg");
  const notRunnable = !ref && !(curTab && curTab.url && curTab.status === "loading"
    && (curTab.url.lastIndexOf("http", 0) === 0 || curTab.url.lastIndexOf("ftp", 0) === 0));
  if (notRunnable) {
    const body = document.body as HTMLBodyElement, docEl = document.documentElement as HTMLHtmlElement;
    body.textContent = "";
    blockedMsg.style.display = "";
    (blockedMsg.querySelector(".version") as HTMLElement).textContent = bgSettings_.CONST_.VerName_;
    const refreshTip = blockedMsg.querySelector("#refresh-after-install") as HTMLElement;
    if (!(Build.BTypes & ~BrowserType.Firefox)
        || Build.BTypes & BrowserType.Firefox && bgOnOther_ === BrowserType.Firefox
        || !curTab || !curTab.url || !(curTab.url.lastIndexOf("http", 0) === 0
        || curTab.url.lastIndexOf("ftp", 0) === 0)) {
      refreshTip.remove();
    } else if (Build.BTypes & BrowserType.Edge
        && (!(Build.BTypes & ~BrowserType.Edge) || bgOnOther_ === BrowserType.Edge)) {
      (refreshTip.querySelector(".action") as HTMLElement).textContent = "open a new web page";
    }
    body.style.width = "auto";
    body.appendChild(blockedMsg);
    docEl.classList.toggle("auto-dark", !!bgSettings_.payload_.d);
    docEl.style.height = "";
  } else {
    nextTick_(versionEl => {
      blockedMsg.remove();
      blockedMsg = null as never;
      const docCls = (document.documentElement as HTMLHtmlElement).classList;
      docCls.toggle("auto-dark", !!bgSettings_.payload_.d);
      docCls.toggle("less-motion", !!bgSettings_.payload_.r);
      versionEl.textContent = bgSettings_.CONST_.VerName_;
    }, $<HTMLElement>(".version"));
  }
  const element = $<HTMLAnchorElement>(".options-link"), optionsUrl = bgSettings_.CONST_.OptionsPage_;
  element.href !== optionsUrl && (element.href = optionsUrl);
  element.onclick = function (this: HTMLAnchorElement, event: Event): void {
    event.preventDefault();
    const a: MarksNS.FocusOrLaunch = BG_.Object.create(null);
    a.u = bgSettings_.CONST_.OptionsPage_;
    BG_.Backend_.focus_(a);
    window.close();
  };
  if (notRunnable) {
    return;
  }

  const bgExclusions = BG_.Exclusions as typeof Exclusions,
  frameInfo: Frames.Sender = ref ? ref[0].s : {
    /** must keep aligned with {@link ../background/main.ts#formatPortSender} */
    i: 0,
    a: curTab.incognito,
    s: Frames.Status.enabled, // not real
    f: Frames.Flags.blank,
    t: curTab.id,
    u: curTab.url
  },
  topUrl = frameInfo.i && ((BG_.Backend_.indexPorts_(curTab.id, 0)
      || {} as Frames.Port).s || {} as Frames.Sender).u || "",
  stateAction = $<EnsuredMountedHTMLElement>("#state-action"), saveBtn = $<HTMLButtonElement>("#saveOptions"),
  stateValue = stateAction.nextElementSibling, stateTail = stateValue.nextElementSibling,
  url = frameInfo.u;
  class PopExclusionRulesOption extends ExclusionRulesOption_ {
    addRule_ (_pattern: string, autoFocus?: false): void {
      super.addRule_(PopExclusionRulesOption.generateDefaultPattern_(), autoFocus);
    }
    isPatternMatched_ (pattern: string) {
      if (!pattern) { return false; }
      const rule = bgExclusions.testers_[pattern] as NonNullable<(typeof bgExclusions.testers_)[string]>;
      if (rule.type_ === ExclusionsNS.TesterType.StringPrefix
          ? !url.lastIndexOf(rule.value_, 0) && (!topUrl || !topUrl.lastIndexOf(rule.value_, 0))
          : rule.value_.test(url) && (!topUrl || rule.value_.test(topUrl))) {
        return true;
      }
      return false;
    }
    populateElement_ (rules1: ExclusionsNS.StoredRule[]): void {
      super.populateElement_(rules1);
      const a = this;
      if (!a.inited_) { return; }
      a.populateElement_ = null as never; // ensure .populateElement_ is only executed for once
      (document.documentElement as HTMLHtmlElement).style.height = "";
      PopExclusionRulesOption.prototype.isPatternMatched_ = ExclusionRulesOption_.prototype.isPatternMatched_;
      let visible_ = a.list_.filter(i => i.visible_) as ExclusionVisibleVirtualNode[], some = visible_.length > 0;
      let element1: SafeHTMLElement;
      inited = some ? 2 : 1;
      if (some) {
        element1 = visible_[0].$keys_;
        updateState(true);
      } else {
        a.addRule_("", false);
        element1 = (a.list_[a.list_.length - 1] as ExclusionVisibleVirtualNode).$keys_;
      }
      nextTick_(() => element1.focus());
    }
    updateVNode_ (vnode: ExclusionVisibleVirtualNode, pattern: string, keys: string): void {
      const patternIsSame = vnode.rule_.pattern === pattern;
      super.updateVNode_(vnode, pattern, keys);
      if (patternIsSame) {
        return;
      }
      const parsedPattern = bgExclusions.createRule_(pattern, ""), patternElement = vnode.$pattern_;
      if (parsedPattern.type_ === ExclusionsNS.TesterType.StringPrefix
          ? !url.lastIndexOf(parsedPattern.value_, 0) : parsedPattern.value_.test(url)) {
        patternElement.title = patternElement.style.color = "";
      } else {
        patternElement.style.color = "red";
        patternElement.title = "Red text means that the pattern does not\nmatch the current URL.";
      }
    }
    static generateDefaultPattern_ (this: void): string {
      const url2 = url.lastIndexOf("http:", 0) === 0
        ? "^https?://" + url.split("/", 3)[2].replace(<RegExpG> /[.[\]]/g, "\\$&") + "/"
        : url.lastIndexOf(location.origin, 0) === 0
        ? ":vimium:/" + new URL(url).pathname.replace("/pages", "")
        : (<RegExpOne> /^[^:]+:\/\/./).test(url) && url.lastIndexOf("file:", 0) < 0
        ? ":" + (url.split("/", 3).join("/") + "/")
        : ":" + url;
      PopExclusionRulesOption.generateDefaultPattern_ = () => url2;
      return url2;
    }
  }

  let saved = true, oldPass: string | null = null, curLockedStatus = Frames.Status.__fake
    , inited: 0 | 1 /* no initial matches */ | 2 /* some matched */ | 3 /* is saving (temp status) */ = 0
  ;
  function collectPass(pass: string): string {
    pass = pass.trim();
    const isReverted = pass && pass[0] === "^";
    isReverted && (pass = pass.slice(1).trimLeft());
    const dict = Object.create<1>(null);
    for (let i of pass.split(" ")) {
      const n = i.charCodeAt(0);
      i = n === kCharCode.lt ? "&lt;" : n === kCharCode.gt ? "&gt;" : n === kCharCode.and ? "&amp;" : i;
      dict[i] = 1;
    }
    return (isReverted ? "^ " : "") + Object.keys(dict).join(" ");
  }
  function updateState(updateOldPass: boolean): void {
    const isSaving = inited === 3;
    let pass = isSaving ? bgExclusions.GetPassKeys_(url, frameInfo)
          : bgExclusions.getTemp_(url, frameInfo, exclusions.readValueFromElement_(true));
    pass && (pass = collectPass(pass));
    if (updateOldPass) {
      oldPass = inited >= 2 ? pass : null;
    }
    inited = 2;
    const same = pass === oldPass;
    const isReverted = !!pass && pass.length > 2 && pass[0] === "^";
    stateAction.textContent =
      (isSaving ? pass ? "becomes to " + (isReverted ? "only hook" : "exclude") : "becomes"
        : (same ? "keeps to " : "will ") + (pass ? isReverted ? "only hook" : "exclude" : "be"))
      + (pass ? ": " : ":");
    stateValue.className = pass ? "code" : "fixed-width";
    stateValue.textContent = pass ? isReverted ? pass.slice(2) : pass : pass !== null ? "disabled" : " enabled";
    stateTail.textContent = curIsLocked && !isSaving && same
      ? ` (on this tab, ${curLockedStatus === Frames.Status.enabled ? "enabled" : "disabled"} for once)`
      : curIsLocked ? " if reset" : "";
    saveBtn.disabled = same;
    (saveBtn.firstChild as Text).data = same ? "No Changes" : "Save Changes";
  }
  function onUpdated(this: void): void {
    if (saved) {
      saved = false;
      let el = $("#helpSpan");
      if (el) {
        (el.nextElementSibling as HTMLElement).style.display = "";
        el.remove();
      }
      saveBtn.removeAttribute("disabled");
      (saveBtn.firstChild as Text).data = "Save Changes";
    }
    updateState(inited < 2);
  }
  function saveOptions(this: void): void {
    if (saveBtn.disabled) {
      return;
    }
    const testers = bgExclusions.testers_;
    BG_.Backend_.forceStatus_("reset", frameInfo.t);
    exclusions.save_();
    setTimeout(function () {
      bgExclusions.testers_ = testers;
    }, 50);
    inited = 3;
    updateState(true);
    (saveBtn.firstChild as Text).data = "Saved";
    if (Build.BTypes & BrowserType.Firefox
        && (!(Build.BTypes & ~BrowserType.Firefox) || bgOnOther_ === BrowserType.Firefox)) {
      saveBtn.blur();
    }
    saveBtn.disabled = true;
    saved = true;
  }
  saveBtn.onclick = saveOptions;
  document.addEventListener("keyup", function (event): void {
    if (event.keyCode === kKeyCode.enter && (event.ctrlKey || event.metaKey)) {
      setTimeout(window.close, 300);
      if (!saved) { return saveOptions(); }
    }
  });

  const rules = bgSettings_.get_("exclusionRules")
    , ref1 = bgExclusions.testers_ = BG_.Object.create(null)
    , ref2 = bgExclusions.rules_;
  for (let _i = 0, _len = rules.length; _i < _len; _i++) {
    ref1[rules[_i].pattern] = ref2[_i * 2];
  }
  const sender = ref ? ref[0].s : <Readonly<Frames.Sender>> { s: Frames.Status.enabled, f: Frames.Flags.Default }
    , toggleAction = sender.s !== Frames.Status.disabled ? "Disable" : "Enable"
    , curIsLocked = !!(sender.f & Frames.Flags.locked);
  curLockedStatus = curIsLocked ? sender.s : Frames.Status.__fake;
  let el0 = $<EnsuredMountedHTMLElement>("#toggleOnce"), el1 = el0.nextElementSibling;
  nextTick_(() => {
  el0.firstElementChild.textContent = curIsLocked ? toggleAction : toggleAction + " for once";
  el0.onclick = forceState.bind(null, toggleAction);
  stateValue.id = "state-value";
  if (curIsLocked) {
    el1.classList.remove("hidden");
    el1.firstElementChild.onclick = forceState.bind(null, "Reset");
  } else {
    el1.remove();
  }
  });
  if (!(Build.BTypes & BrowserType.Chrome)
      || Build.BTypes & ~BrowserType.Chrome && bgOnOther_ !== BrowserType.Chrome
      || bgSettings_.payload_.m
      ) {
    window.addEventListener("keydown", function (event): void {
      if (event.altKey
          && (event.keyCode === kKeyCode.X || curIsLocked && event.keyCode === kKeyCode.Z)
          && !(event.shiftKey || event.ctrlKey || event.metaKey)
          ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        forceState(event.keyCode === kKeyCode.X ? toggleAction : "Reset");
      }
    });
  }
  Option_.suppressPopulate_ = false;
  let exclusions: PopExclusionRulesOption = null as never;
  exclusions = new PopExclusionRulesOption($("#exclusionRules"), onUpdated);
  exclusions.fetch_();
  if (!Build.NDEBUG) {
    interface WindowEx extends Window { exclusions?: PopExclusionRulesOption; }
    (window as WindowEx).exclusions = exclusions;
  }
  window.onunload = function (): void {
    bgExclusions.testers_ = null as never;
    BG_.BgUtils_.GC_(-1);
  };
  BG_.BgUtils_.GC_(1);

  function forceState(act: "Reset" | "Enable" | "Disable", event?: Event): void {
    event && event.preventDefault();
    BG_.Backend_.forceStatus_(act.toLowerCase() as "reset" | "enable" | "disable", frameInfo.t);
    window.close();
  }
}));
