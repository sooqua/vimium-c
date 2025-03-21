
declare namespace CompletersNS {
  const enum SugType {
    Empty = 0,
    bookmark = 1,
    history = 2,
    domain = 4,
    search = 8,
    tab = 16,
    Full = 0x3f,
  }
  /**
   * only those >= .Default can be used in content
   */
  const enum MatchType {
    plain = 0,
    Default = plain,
    emptyResult = 1, // require query is not empty
    someMatches = 2,
    /**
     * must > someMatches
     */
    searchWanted = 3,
    reset = -1,
    /**
     * is the same as searchWanted
     */
    searching_ = -2,
    SugTypeOffset = 3,
    MatchTypeMask = (1 << SugTypeOffset) - 1,
  }
  type ValidTypes = "bookm" | "domain" | "history" | "omni" | "bomni" | "search" | "tab";
  /**
   * "math" can not be the first suggestion, which is limited by omnibox handlers
   */
  type ValidSugTypes = ValidTypes | "math";
  const enum QueryFlags {
    None = 0,
    SingleLine = 1,
    TabInCurrentWindow = 2,
    MonospaceURL = 4,
  }
  interface Options {
    /** maxChars */ c?: number;
    /** maxResults */ r?: number;
    /** flags */ f: QueryFlags;
    /** last sug types: empty means all */ t: SugType;
    /** original type */ o: ValidTypes;
  }

  interface WritableCoreSuggestion {
    type_: ValidSugTypes;
    url_: string;
    title: string; // used by vomnibar.html
    text_: string;
  }

  type CoreSuggestion = Readonly<WritableCoreSuggestion>;

  interface BaseSuggestion extends CoreSuggestion {
    text_: string;
    textSplit?: string;
    title: string;
    sessionId_?: string | number;
    label?: string;
    visited_?: boolean;
    favIcon?: string;
  }
  interface Suggestion extends BaseSuggestion {
    relevancy_: number;
  }
  interface SearchSuggestion extends Suggestion {
    type_: "search";
    // not empty
    pattern_: string;
  }
  interface TabSuggestion extends Suggestion {
    level?: string;
  }
}

declare namespace MarksNS {
  interface ScrollInfo extends Array<any> {
    [0]: number;
    [1]: number;
  }
  interface ScrollableMark {
    scroll: ScrollInfo;
  }
  interface BaseMark {
    /** markName */ n: string;
  }

  interface BaseMarkProps {
    /** scroll */ s: ScrollInfo;
    /** url */ u: string;
  }

  interface Mark extends BaseMark, BaseMarkProps {
  }

  interface NewTopMark extends BaseMark {
    /** scroll */ s?: undefined;
  }
  interface NewMark extends Mark {
    /** local */ l?: boolean; /** default to false */
  }

  interface FgGlobalQuery extends BaseMark {
    /** prefix */ p?: boolean; /** default to false */
    /** local */ l?: false; /** default to false */
    /** url */ u?: undefined;
  }
  interface FgLocalQuery extends BaseMark {
    /** prefix */ p?: undefined;
    /** local */ l: true;
    /** url */ u: string;
    /** old */ o?: {
      /** scrollX */ x: number,
      /** scrollY */ y: number,
      /** hash */ h: string,
    };
  }
  type FgQuery = FgGlobalQuery | FgLocalQuery;

  interface FgMark extends ScrollInfo {
    [2]?: string;
  }

  interface FocusOrLaunch {
    /** scroll */ s?: ScrollInfo;
    /** url */ u: string;
    /** prefix */ p?: boolean;
    /** reuse */ r?: ReuseType;
  }
}

declare namespace VisualModeNS {
  const enum Mode {
    NotActive = 0, Default = NotActive,
    Visual = 1,
    Line = 2,
    Caret = 3,
  }
  const enum kDir {
    left = 0, right = 1, unknown = 2,
    __mask = -1,
  }
  type ForwardDir = kDir.left | kDir.right;
}
declare const enum KeyAction {
  cmd = 0, count = 1,
  __mask = -1,
}
type ValidChildKeyAction = KeyAction.cmd;
type ValidKeyAction = ValidChildKeyAction | KeyAction.count;
interface ChildKeyMap {
  [index: string]: ValidChildKeyAction | ChildKeyMap | undefined;
  readonly __proto__: never;
}
interface ReadonlyChildKeyMap {
  readonly [index: string]: ValidChildKeyAction | ReadonlyChildKeyMap | undefined;
}
type KeyMap = ReadonlySafeDict<ValidKeyAction | ReadonlyChildKeyMap>;

type TextElement = HTMLInputElement | HTMLTextAreaElement;

declare const enum ReuseType {
  current = 0,
  Default = current,
  reuse = 1,
  newFg = -1,
  newBg = -2
}

declare const enum FrameMaskType {
  NoMaskAndNoFocus = 0,
  NoMask = 1,
  OnlySelf = 2,
  NormalNext = 3,
  ForcedSelf = 4,
  minWillMask = OnlySelf,
}

declare const enum ProtocolType {
  others = 0,
  http = 7, https = 8,
}

declare namespace Frames {
  const enum Status {
    enabled = 0, partial = 1, disabled = 2,
    __fake = -1
  }
  const enum Flags {
    Default = 0, blank = Default,
    locked = 1,
    userActed = 2,
    lockedAndUserActed = locked | userActed,
    InheritedFlags = locked | userActed,
    hasCSS = 4,
    hasCSSAndActed = hasCSS | userActed,
    hadHelpDialog = 8,
    hadVisualMode = 16,
    hasFindCSS = 32,
    OtherExtension = 64,
    vomnibarChecked = 128,
    isVomnibar = 256,
    sourceWarned = 512,
  }
  const enum NextType {
    next = 0, Default = next,
    parent = 1,
    current = 2,
  }
}

declare const enum PortNameEnum {
  Prefix = "vimium-c.",
  PrefixLen = 9,
  Delimiter = "@",
}

declare const enum PortType {
  initing = 1,
  hasFocus = 2,
  isTop = 4,
  omnibar = 8, omnibarRe = 9,
  /** the below should keep the consistent with Frames.Status, so that code in OnConnect works */
  BitOffsetOfKnownStatus = 4, MaskOfKnownStatus = 3,
  knownStatusBase = 1 << BitOffsetOfKnownStatus, flagsBase = knownStatusBase << 2,
  knownEnabled = knownStatusBase + (0 << BitOffsetOfKnownStatus),
  knownPartial = knownStatusBase + (1 << BitOffsetOfKnownStatus),
  knownDisabled = knownStatusBase + (2 << BitOffsetOfKnownStatus),
  hasCSS = flagsBase, isLocked = flagsBase * 2,
  CloseSelf = 999,
}

declare namespace SettingsNS {
  interface BaseBackendSettings {
    focusNewTabContent: boolean;
    newTabUrl_f: string;
    showAdvancedCommands: boolean;
    vomnibarOptions: {
      maxMatches: number;
      queryInterval: number;
      styles: string;
    };
  }
  interface FrontUpdateAllowedSettings {
    showAdvancedCommands: 0;
  }
  interface FrontendSettings {
    keyboard: [number, number];
    linkHintCharacters: string;
    regexFindMode: boolean;
    scrollStepSize: number;
    smoothScroll: boolean;
  }
  interface FrontendSettingNameMap {
    keyboard: "k";
    linkHintCharacters: "l";
    regexFindMode: "R";
    smoothScroll: "S";
    scrollStepSize: "t";
  }
  type CachedFrontendSettingsTemplate<T> = T extends keyof FrontendSettingNameMap ? {
    [k in FrontendSettingNameMap[T]]: FrontendSettings[T];
  } : never;
  type CachedFrontendSettings = UnionToIntersection<CachedFrontendSettingsTemplate<keyof FrontendSettings>>;
  interface FrontendSettingsSyncedManually {
    /** reduceMotion */ r: boolean;
    /** darkMode */ d: " D" | "";
  }
  interface FrontendSettingsWithoutSyncing {
    /** browserVer */ readonly v?: BrowserVer;
    /** browser */ readonly b?: BrowserType;
    /** onMac: `mac`: true, `win`: 0, `others`: false */ readonly m: boolean | 0;
    /** grabBackFocus */ g: boolean;
  }
  interface FrontendSettingsWithSync extends CachedFrontendSettings, FrontendSettingsSyncedManually {}
  /** Note: should have NO names which may be uglified */
  interface FrontendSettingCache extends FrontendSettingsWithSync, FrontendSettingsWithoutSyncing {
    /** browserVer */ readonly v: BrowserVer;
  }
}

declare const enum HintMode {
  empty = 0, focused = 1, list = 1, newTab = 2, mask_focus_new = focused | newTab,
  queue = 16, min_job = 32, min_disable_queue = 64,
  OPEN_IN_CURRENT_TAB = empty, DEFAULT = OPEN_IN_CURRENT_TAB, // also 1
  OPEN_IN_NEW_BG_TAB = newTab,
  OPEN_IN_NEW_FG_TAB = newTab | focused,
  OPEN_CURRENT_WITH_QUEUE = queue,
  OPEN_WITH_QUEUE = queue | newTab,
  OPEN_FG_WITH_QUEUE = queue | newTab | focused,
  HOVER = min_job, min_hovering = HOVER,
  LEAVE, max_hovering = LEAVE, max_mouse_events = LEAVE,
  FOCUS,
  DOWNLOAD_MEDIA, min_media = DOWNLOAD_MEDIA,
  OPEN_IMAGE, max_media = OPEN_IMAGE,
  SEARCH_TEXT,
  COPY_TEXT = ((SEARCH_TEXT + 1) & ~1), min_copying = COPY_TEXT, mode1_text_list = COPY_TEXT | list,
  COPY_URL, mode1_url_list = COPY_URL | list, min_link_job = COPY_URL, max_copying = mode1_url_list,
  DOWNLOAD_LINK,
  OPEN_INCOGNITO_LINK,
  EDIT_LINK_URL = min_disable_queue,
    max_link_job = EDIT_LINK_URL,
    min_edit = EDIT_LINK_URL,
  EDIT_TEXT,
    max_edit = EDIT_TEXT,
  FOCUS_EDITABLE,
}

declare namespace VomnibarNS {
  const enum PageType {
    inner = 0, ext = 1, web = 2,
    Default = inner,
  }
  interface GlobalOptions {
    mode: string;
    currentWindow?: boolean;
    silentOnEmpty: boolean;
    newtab: boolean;
    /** @deprecated */
    force: boolean;
    keyword: string;
    url?: true | string | null;
  }
}

declare const enum InjectorTask {
  reload = 1,
  recheckLiving = 2,
  reportLiving = 3,
  extInited = 4,
}
interface VimiumInjectorTy {
  id: string;
  alive: 0 | 0.5 | 1 | -1;
  host: string;
  version: string;
  $h: string;
  clickable: WeakSet<Element> | null | undefined;
  cache: Dict<any> | null;
  getCommandCount: (this: void) => number;
  checkIfEnabled: (this: void) => void;
  /** on message to run */ $m (taskType: BgReq[kBgReq.injectorRun]): void;
  $r (taskType: InjectorTask): void;
  $p?: [
    <K extends keyof FgReq> (this: void, request: FgReq[K] & Req.baseFg<K>) => void
    , () => string
  ] | null;
  reload (req?: boolean | InjectorTask.reload): void;
  destroy: ((this: void, silent?: boolean) => void) | null;
}

interface Document extends DocumentAttrsToBeDetected {}

declare const enum GlobalConsts {
  TabIdNone = -1,
  VomnibarFakeTabId = -3,
  MaxImpossibleTabId = -4,
  WndIdNone = -1,
  VomnibarSecretTimeout = 3000,
  VomnibarWheelStepForPage = 300,
  VomnibarWheelIntervalForPage = 150,
  WheelTimeout = 330,
  TouchpadTimeout = 120,
  DefaultRectFlashTime = 400,
  // limited by Pagination.findAndFollowLink_
  MaxNumberOfNextPatterns = 200,
  MaxBufferLengthForPasting = 8192,
  TimeoutToReleaseBackendModules = /** (to make TS silent) 1000 * 60 * 5 */ 300000,
  ToleranceOfNegativeTimeDelta = 5000,
  ThresholdToAutoLimitTabOperation = 2, // 2 * Tab[].length
  LinkHintTooHighThreshold = 20, // scrollHeight / innerHeight
  LinkHintPageHeightLimitToCheckViewportFirst = 15000,
  MinElementCountToStopScanOnClick = 5000,
  MaxScrollbarWidth = 24,
  MinScrollableAreaSizeForDetection = 50,
  MaxHeightOfLinkHintMarker = 18,
  FirefoxFocusResponseTimeout = 340,
  MaxLimitOfVomnibarMatches = 25,
  MaxFindHistory = 50,
  TimeOfSuppressingTailKeydowns = 200,
  CommandCountLimit = 9999,
  MediaWatchInterval = 60_000, // 60 seconds - chrome.alarms only accepts an interval >= 1min, so do us
  MaxHistoryURLLength = 2_000, // to avoid data: URLs and malformed webpages
  MaxSenderURLLength = 4_000, // if too long, keep the first `MaxSenderURLLength` characters and append a "..."
  TrimmedURLLengthForTooLongURL = 320,
  TrimmedTitleLengthForTooLongURL = 160,
  // so that `P` = 89 / 9e6 < 1e-5
  SecretRange = 9e6,
  SecretBase = 1e6,
  MaxRetryTimesForSecret = 89,
  SecretStringLength = 7,
  MarkForName3Length = 10,
  SYNC_QUOTA_BYTES = 102_400, // QUOTA_BYTES of storage.sync in https://developer.chrome.com/extensions/storage
  SYNC_QUOTA_BYTES_PER_ITEM = 8192,
  /** ceil(102_400 / (8192 - (12 + 16) * 4)) ; 12 and 16 is inner consts in {@link ../background/others.ts} */
  MaxSyncedSlices = 13,
  LOCAL_QUOTA_BYTES = 5_242_880, // 5MB ; no QUOTA_BYTES_PER_ITEM for local
  LOCAL_STORAGE_BYTES = 10_485_760, // 10MB
  MaxTabTreeIndent = 5,
}

declare const enum kCharCode {
  tab = 9, space = 32, minNotSpace, bang = 33, quote2 = 34, hash = 35,
  maxCommentHead = hash, and = 38, quote1 = 39, minNotInKeyNames = 41,
  /** '-' */ dash = 45,
  dot = 46, slash = 47,
  maxNotNum = 48 - 1, N0, N9 = N0 + 9, minNotNum, colon = 58, lt = 60, gt = 62, question = 63,
  A = 65, minAlphabet = A, B, C, I = A + 8, W = A + 22, minLastAlphabet = A + 25, minNotAlphabet,
  a = 97, CASE_DELTA = a - A,
  backslash = 92, s = 115,
}

declare const enum kKeyCode {
  None = 0,
  backspace = 8, tab = 9, enter = 13, shiftKey = 16, ctrlKey = 17, altKey = 18, esc = 27,
  minAcsKeys = 16, maxAcsKeys = 18,
  maxNotPrintable = 32 - 1, space, maxNotPageUp = space, pageup, minNotSpace = pageup,
  pagedown, maxNotEnd = pagedown, end, home, maxNotLeft = home, left, up,
  right, minNotUp = right, down, minNotDown, minNotInKeyNames = minNotDown,
  maxNotInsert = 45 - 1, insert, deleteKey, minNotDelete,
  maxNotNum = 48 - 1, N0, N9 = N0 + 9, minNotNum,
  maxNotAlphabet = 65 - 1, A, B, C, D, E, F, G, H, I, J, K, L, M, N,
  O, P, Q, R, S, T, U, V, W, X, Y, Z, MinNotAlphabet,
  metaKey = 91, menuKey = 93, maxNotFn = 112 - 1, f1, f2, f5 = f1 + 4,
  f10 = f1 + 9, f12 = f1 + 11, f13, f20 = f1 + 19, minNotFn, ime = 229,
  questionWin = 191, questionMac = kCharCode.question,
}
declare const enum KeyStat {
  Default = 0, plain = Default,
  altKey = 1, ctrlKey = 2, metaKey = 4, shiftKey = 8,
  PrimaryModifier = ctrlKey | metaKey,
}

declare const enum BrowserType {
  Chrome = 1,
  Firefox = 2,
  Edge = 4,
  Unknown = 8,
  ChromeOrFirefox = Chrome | Firefox,
  _mask = 127,
}

/**
 * #define EXPERIMENTAL (#enable-experimental-web-platform-features \
 *    && #enable-javascript-harmony \
 *    && #enable-experimental-canvas-features \
 * )
 * #define LEGACY (#disable-javascript-harmony-shipping)
 * #define EMPTY ((a clean User Data)
 * #define LATEST_TESTED 73.0.3683.86
 */
declare const enum BrowserVer {
  // display:flex still exists on C31 (C29, from MDN)
  MinShadowDOMV0 = 31, // the real version is <= C31; it's prefixed
  MinSupported = 32,
  MinEnsuredES6Promise = 32, // even if LEGACY
  // the 5 below are correct even if EXPERIMENTAL or LEGACY
  Min$URL$NewableAndInstancesHaveProperties = 32,
  Min$KeyboardEvent$$Repeat$ExistsButNotWork = 32, // replaced by MinCorrect$KeyboardEvent$$Repeat (C38)
  Min$document$$hidden = 33, // unprefixed; .webkitHidden still exists on C31
  // `<input type=number>.selectionStart` throws since Chrome 33 and before C58 (Min$selectionStart$MayBeNull),
  Min$selectionStart$MayThrow = 33,
  Min$Object$$setPrototypeOf = 34,
  // before C34, 2 images share a size part (the first one's), and different height/width would work as the smaller one
  /** {@see ../pages/options.css#select { background: ...; }} */
  MinMultipleBackgroundImagesNotShareSizePart = 34,
  // on C34 and if EXPERIMENTAL, then it's not implied; before C37, `'unsafe-inline'` is necessary in CSP
  StyleSrc$UnsafeInline$MayNotImply$UnsafeEval = 34,
  MinEnsuredUnprefixedShadowDOMV0 = 35, // even if LEGACY
  MinEnsured$ActivateEvent$$Path = 35, // = MinEnsuredUnprefixedShadowDOMV0
  // there're WeakMap, WeakSet, Map, Set and Symbols on C35 if #enable-javascript-harmony
  MinEnsuredES6WeakMapAndWeakSet = 36,
  // but shadowRoot.getElementById still exists on C31
  Min$DocumentFragment$$getElementById = 36, // even if EXPERIMENTAL or LEGACY
  MinPhysicalPixelOnWindows = 37, // even if EXPERIMENTAL or LEGACY; replaced by MinHighDPIOnWindows
  // before C37, if a page has no `'unsafe-inline'` in its CSP::`style-src`, then Vimium's styles is totally broken
  MinStyleSrcInCSPNotBreakUI = 37, // even if EXPERIMENTAL or LEGACY
  MinSessions = 37,
  // even if EXPERIMENTAL; Note: should use MinSafeCSS$All
  /** @deprecated */
  MinCSS$All$Attr = 37,
  /*
   * an `all:initial` prevents position/z-index attrs in other matched rules from working
   * this Chrome bug causes the help dialog may have `position: static;`
   * * the initial "position" attr and rendered view are correct
   * * but after a mousemove / wheel, the "position" attr becomes "static" and the view breaks
   * * it recovers if modifying its position/z-index attr
   * * if the Dev Tools is on, and visits styles of the box, then a mousemove won't break the UI
   *
   * a work-around is set <div>.style.position,
   * but the HUD is also affected when pressing <Shift> to switch LinkHint mode,
   * so must remove the all: before MinFixedCSS$All$MayMistakenlyResetFixedPosition
   */
  MinCSS$All$MayMistakenlyResetFixedPosition = 37,
  MinEnsuredHTMLDialogElement = 37, // not on Edge; under a flag since FF53; still exists on C31 if EXPERIMENTAL
  // even if EXPERIMENTAL or LEGACY
  MinES6$ForOf$Map$SetAnd$Symbol = 38,
  // .repeat exists since C32, but only works since C38, even if EXPERIMENTAL
  // because there seems no simple fix, just ignore it
  // https://bugs.chromium.org/p/chromium/issues/detail?id=394907
  MinCorrect$KeyboardEvent$$Repeat = 38,
  MinEnsuredTextEncoderAndDecoder = 38, // even if LEGACY; still exists on C31 if EXPERIMENTAL
  MinWithFrameIdInArg = 39,
  MinMaybe$String$$StartsWithAndEndsWith = 39, // if EXPERIMENTAL
  MinOptionsUI = 40,
  MinDisableMoveTabAcrossIncognito = 40,
  // even if EXPERIMENTAL or LEGACY
  MinWarningSyncXHR = 40,
  MinEnsured$Element$$Closest = 41, // even if LEGACY
  MinWithFrameId = 41,
  // just means it's enabled by default
  Min$String$$StartsWithEndsWithAndIncludes$ByDefault = 41, // no "".includes before 41, even if EXPERIMENTAL
  MinGlobal$HTMLDetailsElement = 41,
  MinFixedCSS$All$MightMistakenlyResetFixedPosition = 41,
  MinSafeCSS$All = MinFixedCSS$All$MightMistakenlyResetFixedPosition,
  // (if EXPERIMENTAL, then it exists since C34 but) has no effects before C41;
  // if EXPERIMENTAL, there's Element::scrollTo and Element::scrollBy only since C41
  MinCSS$ScrollBehavior$$Smooth$Work = 41,
  // MethodFunction is accepted since C42 if EMPTY
  MinMayBeES6MethodFunction = 41, // if EXPERIMENTAL
  // before 42, event.path is a simple NodeList instance ; even if EXPERIMENTAL or LEGACY
  Min$Event$$path$IsStdArrayAndIncludesWindow = 42,
  Min$Tabs$$getZoom = 42,
  Min$EnableSitePerProcess$Flag = 42,
  MinParentNodeGetterInNodePrototype = 42, // also .childNodes; even if even if EXPERIMENTAL or LEGACY
  // before C43, "font-size: ***" of <select> overrides those of its <options>s'
  // since C42@exp, <option> is visible, but its text has a strange extra prefix of "A" - fixed on C43
  Min$Option$HasReliableFontSize = 43, // even if LEGACY
  MinEnsuredES6$String$$StartsWithEndsWithAndRepeatAndIncludes = 43, // even if LEGACY
  MinSafe$String$$StartsWith = MinEnsuredES6$String$$StartsWithEndsWithAndRepeatAndIncludes + 1, // add a margin
  MinRuntimePlatformOs = 44,
  MinCreateWndWithState = 44,
  // the 2 below are correct even if EXPERIMENTAL or LEGACY
  // #scroll-top-left-interop is also since C44
  // `scrollingElement` is added in (commit 8df26a52e71e5b239c3749ec6f4180441ee4fc7e)
  // before C44, the real scrolling may be <body> even if document.compatMode is "CSS1Compat"
  // - it's said this behavior is for compatibility with websites at that time
  Min$Document$$ScrollingElement = 44,
  MinTreat$LetterColon$AsFilePath = 44,
  // the 2 below are even if EXPERIMENTAL or EMPTY
  MinMayBeES6ArrowFunction = 45,
  // for VHints.traverse_, Array.from takes >= 2x time to convert a static NodeList of 7242 elements to an array
  // and the average time data is 119~126ms / 255~266ms for 100 times
  Min$Array$$From = 45,
  // even if LEGACY
  MinEnsuredES6MethodFunction = 45, // e.g.: `a = { b() {} }`
  MinMuted = 45,
  MinMutedInfo = 46,
  // even if EXPERIMENTAL or LEGACY
  MinAutoDecodeJSURL = 46,
  // even if EXPERIMENTAL or LEGACY
  Min$Event$$IsTrusted = 46,
  // occur on Chrome 46 if EXPERIMENTAL; always enabled since C47 even if LEGACY
  MinMayBe$requestIdleCallback = 46,
  Min$windows$APIsFilterOutDevToolsByDefault = 46,
  MinEnsured$requestIdleCallback = 47,
  Min$Tabs$$Query$RejectHash = 47,
  // if .key exists, it's "v" for `v`, but "" (empty) for `<c-v>` - doesn't support all cases
  Min$KeyboardEvent$MayHas$$Key = 47, // if EXPERIMENTAL
  Min$IFrame$MayHas$$Referrerpolicy = 47, // if EXPERIMENTAL
  // even if EXPERIMENTAL or LEGACY
  // before: real-width := Math.floor(width * zoom)
  // after: real-width := Math.floor(width * zoom) || (width ? 1 : 0)
  MinEnsuredBorderWidthWithoutDeviceInfo = 48, // inc 0.0001px to the min "visible" width
  // if LEGACY, arrow functions will be accepted only since C48,
  // but this flag will break the Developer Tools (can not open the window) on Chrome 46/47/48,
  // so Chrome can only debug arrow functions since 49
  MinEnsuredES6ArrowFunction = 48,
  // even if EXPERIMENTAL or LEGACY
  MinSafeGlobal$frameElement = 48,
  // just means it's enabled even if LEGACY;
  // if EXPERIMENTAL, .code is "" on Chrome 42/43, and works well since C44
  MinEnsured$KeyboardEvent$$Code = 48,
  MinMayBeShadowDOMV1 = 48, // if EXPERIMENTAL
  // a path of an older DOMActivate event has all nodes (windows -> nodes in shadow DOM)
  // this feature is enabled by default on C53, 54, 55;
  // and replaced by MinDOMActivateInClosedShadowRootHasNoShadowNodesInPathWhenOnDocument since C56
  MinMayNoDOMActivateInClosedShadowRootPassedToFrameDocument = 48, // if EXPERIMENTAL
  MinEnsuredTouchEventConstructor = 48, // even if LEGACY
  MinEnsured$Array$$Includes = 49, // even if LEGACY
  // the 2 below are correct even if EXPERIMENTAL or LEGACY
  MinSafeWndPostMessageAcrossProcesses = 49,
  MinES6No$Promise$$defer = 49,
  /* content scripts are always injected (tested on Chrome from 35 to 66), and can always be listed by the Dev Tools */
  // even if EXPERIMENTAL or LEGACY; length of an older addEventListener is 0
  Min$addEventListener$$length$Is2 = 49,
  // by default, `noreferrer` can also make `opener` null, and it still works on C35
  // a single `noopener` only works since C49 even if EXPERIMENTAL or LEGACY
  MinLinkRelAcceptNoopener = 49,
  MinSVG$Path$MayHave$d$CSSAttribute = 49, // if #enable-experimental-web-platform-features is on
  MinTestedES6Environment = 49, // must be <= MinEnsuredFullES6Environment
  // Object.observe is from C36 to C49 even if EXPERIMENTAL or LEGACY
  MinES6No$Object$$Observe = 50,
  // The real support for arg frameId of chrome.tabs.executeScript is since C50,
  //   and is neither 41 (an older version) nor 39 (cur ver on 2018-02-18)
  //   in https://developer.chrome.com/extensions/tabs#method-executeScript.
  // And, all "since C39" lines are totally wrong in the 2018-02-18 version of `tabs.executeScript`
  Min$tabs$$executeScript$hasFrameIdArg = 50,
  MinSVG$Path$Has$Use$Attribute = 50, // <path use="..." />
  MinMaybe$window$$InputEvent = 50, // only if EXPERIMENTAL
  // MinShowBlockForBrokenImage = 51, // not reproduced
  // the 2 below just mean they're enabled even if LEGACY
  MinIFrameReferrerpolicy = 51,
  MinEnsured$KeyboardEvent$$Key = 51,
  // the 6 below are correct even if EXPERIMENTAL or LEGACY
  MinPassiveEventListener = 51,
  // before C51, if an iframe has no scrollable boxes, its parent frame scrolls and gets events
  // since C51, its parent still scrolls but gets no wheel events
  MinNotPassMouseWheelToParentFrameEvenIfSelfNotScrolled = 51,
  MinNoCustomMessageOnBeforeUnload = 51,
  MinShadowDOMV1HasMode = 51,
  Min$Node$$isConnected = 51, // not on Edge
  Min$ScrollIntoView$SetTabNavigationNode = 51,
  // Chrome also began to put contain attr in use on 51 if EXPERIMENTAL
  // but obviously there's some bugs about this feature
  CSS$Contain$BreaksHelpDialogSize = 51,
  // test: var {a,b,c}={a:(...a)=>[-1,`${Math.sign(2)}`,...a],b(i=2){return i*6}, ['c'](d){let j=class A{};return ""+j}}
  // on C51, the above passes, but the Developer Tools can not be opened if LEGACY
  MinEnsuredFullES6Environment = 52,
  // the 2 below are correct even if EXPERIMENTAL or LEGACY
  MinNoUnmatchedIncognito = 52,
  // since https://github.com/chromium/chromium/commit/866d1237c72059624def2242e218a7dfe78b125e
  MinEventListenersFromExtensionOnSandboxedPage = 52,
  // the 4 below are correct even if LEGACY
  MinCSSEnableContain = 52,
  MinSVG$Path$Has$d$CSSAttribute = 52, // svg path { d: path('...'); }
  MinForcedDirectWriteOnWindows = 52,
  // if #enable-site-per-process or #enable-top-document-isolation,
  // for 3rd-party child frames in other processes, it keeps the same only since C52 even if EXPERIMENTAL
  MinEnsuredChildFrameUseTheSameDevicePixelRatioAsParent = 52,
  MinPositionMayBeSticky = 52, // if EXPERIMENTAL; enabled by default since C56 even if LEGACY
  MinAutoScrollerAllocNewSpace = 53, // even if EXPERIMENTAL or LEGACY; if box-sizing is content-box
  MinEnsuredShadowDOMV1 = 53,
  // since C53, Vimium's inner styles have been really safe, because `>>>` only works on "open" mode shadow trees
  MinEnsuredSafeInnerCSS = MinEnsuredShadowDOMV1,
  // wekitUserSelect still works on C35
  MinUserSelectAll = 53,
  // even if EXPERIMENTAL or LEGACY
  MinUntrustedEventsDoNothing = 53, // fake click events won't show a <select>'s popup
  // before Chrome 53, there may be window.VisualViewPort under flags, but not the instance
  Min$visualViewPort$UnderFlags = 53, // window.visualViewPort occurs if EXPERIMENTAL
  // only Chrome accepts it:
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/extension/getViews
  Min$Extension$$GetView$AcceptsTabId = 54,
  Min$tabs$$discard = 54,
  // the 7 below are correct even if EXPERIMENTAL or LEGACY
  MinUnprefixedUserSelect = 54,
  MinHighDPIOnWindows = 54, // replace MinPhysicalPixelOnWindows
  MinNo$KeyboardEvent$$keyIdentifier = 54,
  // https://chromium.googlesource.com/chromium/src/+/9520623861da283533e71d6b7a8babd02675cb0b
  Min$Node$$getRootNode = 54, // not on Edge
  MinOnFocus$Event$$Path$IncludeOuterElementsIfTargetInShadowDOM = 55,
  // before C55, onActivate should only be installed on document
  Min$ActivateEvent$$Path$IncludeWindowAndElementsIfListenedOnWindow = 55,
  Min$SVGElement$$dataset = 55,
  // MinStricterArgsIn$Windows$$Create = 55, // I forget what's stricter
  MinSomeDocumentListenersArePassiveByDefault = 56,
  // not need if LEGACY or EMPTY (even on Chrome 66)
  MinMayNeedCSPForScriptsFromOtherExtensions = 56, // if EXPERIMENTAL
  // the 3 below are correct even if EXPERIMENTAL or LEGACY
  MinDOMActivateInClosedShadowRootHasNoShadowNodesInPathWhenOnDocument = 56,
  MinFailToToggleImageOnFileURL = 56,
  // note: an "input" event is not KeyboardEvent: {@see Min$InputEvent$$isComposing}
  Min$KeyboardEvent$$isComposing = 56,
  // the static selector `>>>` is not supported since MinNoSelector$GtGtGt
  // `>>>` can only match those under "open"-mode shadow roots
  MinStaticSelector$GtGtGt$IfFlag$ExperimentalWebPlatformFeatures$Enabled = 56,
  // the 2 below are correct even if EXPERIMENTAL or LEGACY
  MinNoKeygenElement = 57,
  MinCSSPlaceholderPseudo = 57,
  MinEnsuredCSSGrid = 57, // even if LEGACY; still partly works on C35 if EXPERIMENTAL
  /*
   * Chrome before 58 does this if #enable-site-per-process or #enable-top-document-isolation;
   * Chrome 56 / 57 always merge extension iframes if EXPERIMENTAL
   * Chrome since 58 always merge extension iframes even if the two flags are disabled and LEGACY
   *
   * Special cases:
   * Chrome 55 does this by default (unless turn one of the flags on and then off);
   * if #enable-top-document-isolation, Chrome since 56 merge them,
   *   while Chrome before 56 move extension iframes into different processes (not shared one)
   *     if not #enable-site-per-process;
   * since C56, if one flag is turned on and then off,
   *   it will still take effects on extension iframes, so extension iframes are always merged,
   *   while Chrome before 56 can turn off them totally
   */
  MinExtIframesAlwaysInSharedProcess = 58,
  MinExtensionContentPageAlwaysCanShowFavIcon = MinExtIframesAlwaysInSharedProcess,
  MinEmbedElementIsNotFunction = 58,
  // the 6 below are correct even if EXPERIMENTAL or LEGACY
  MinCaseSensitiveUsemap = 58,
  // tmp_width := (since 58 ? Math.round : Math.floor)(width * devicePixelRatio * zoom)
  // real_width := width && Math.max(tmp_width, 1)
  MinBorderWidthIsRounded = 58,
  // Chrome changed its behavior to match the new spec on C58 (replace Min$selectionStart$MayThrow)
  Min$selectionStart$MayBeNull = 58,
  // .type is always 'Caret'
  $Selection$NotShowStatusInTextBox = 58, // Now only version 81-110 of Chrome 58 stable have such a problem
  /** @see {@link content/mode_visual.ts#VVisual.init_ } */
  MinSelExtendForwardOnlySkipWhitespaces = 59,
  Min$Space$NotMatch$U180e$InRegExp = 59,
  MinMaybeUnicodePropertyEscapesInRegExp = 59, // only if EXPERIMENTAL
  // the 2 below are correct even if EXPERIMENTAL or LEGACY
  // PasswordSaverDispatchesVirtualFocusEvents (document.activeElement is not updated)
  //   is confirmed on Chrome LATEST_TESTED
  // See `WebFormControlElement::SetAutofillValue` on
  // https://cs.chromium.org/chromium/src/third_party/blink/renderer/core/exported/web_form_control_element.cc?l=138
  MinPasswordSaverDispatchesVirtualFocusEvents = 59,
  Min$InputEvent$$isComposing = 60,
  MinEnsured$window$$InputEvent = 60, // even if LEGACY
  MinWarningWebkitGradient = 60, // only happened on a Canary version
  MinOmniboxUIMaxAutocompleteMatchesMayBe12 = 60, // #omnibox-ui-max-autocomplete-matches
  // only if EXPERIMENTAL; tests show there're mouseover/mousedown/mouseup/mouseout events
  // but no click events
  MinMaybeSomeMouseEventsOnDisabledFormControlElements = 60,
  // the 8 below are correct even if EXPERIMENTAL or LEGACY
  MinNoBorderForBrokenImage = 60,
  MinNoSelectionColorOnTextBoxWhenFindModeHUDIsFocused = 60,
  MinTabsCreateRefuseOpenerTabIdIfNotOnCurrentWindow = 61,
  MinRoundedBorderWidthIsNotEnsured = 61, // a border is only showing if `width * ratio * zoom >= 0.5`
  // a bug of styke.zoom not working is fixed since MinASameZoomOfDocElAsdevPixRatioWorksAgain
  MinDevicePixelRatioImplyZoomOfDocEl = 61,
  MinCorrectBoxWidthForOptionUI = 61,
  Min$visualViewPort$ = 61,
  MinScrollIntoViewOptions = 61,
  // also means ensured Element::scrollBy, Element::scrollTo and window.scrollTo/scrollBy({})
  // not on edge
  MinEnsuredCSS$ScrollBehavior = 61, // still exists since C34 (although has no effects before C41) if EXPERIMENTAL
  // e.g. https://www.google.com.hk/_/chrome/newtab?espv=2&ie=UTF-8
  MinNotRunOnChromeNewTab = 61,
    // according to https://github.com/w3ctag/design-reviews/issues/51#issuecomment-96759374 ,
    // `scrollingElement` can be <frameset> on C44
    // which has been fixed commit 0cf160e2ff055fb12c562cabc2da9e62db14cc8d (if #scroll-top-left-interop is enabled),
    // and it's always fixed since C61
  MinEnsured$ScrollingElement$CannotBeFrameset = 61,
  MinScrollTopLeftInteropIsAlwaysEnabled = 61,
  MinMaybe$Document$$fullscreenElement = 61, // if EXPERIMENTAL
  MinCSS$Color$$RRGGBBAA = 62,
  Min$NotSecure$LabelsForSomeHttpPages = 62, // https://developers.google.com/web/updates/2017/10/nic62#https
  // there's a bug of C62/63 even if EXPERIMENTAL or LEGACY:
  // * if a `createShadowRoot()` from ext isolates after docReady and before wnd.onload,
  //   then some pages using ShadowDOM v0 heavily may be stuck.
  // * before C62 / since C64 / attachShadow has no such a bug
  // https://github.com/philc/vimium/issues/2921#issuecomment-361052160
  CreateShadowRootOnDocReadyBreakPages1 = 62,
  CreateShadowRootOnDocReadyBreakPages2 = 63,
  // the 6 below are correct even if EXPERIMENTAL or LEGACY
  // `/deep/` works on C35 even if LEGACY
  // static `/deep/` selector in query is still supported on Chrome LATEST_TESTED
  // https://www.chromestatus.com/features/6750456638341120
  MinSelector$deep$InDynamicCSSMeansNothing = 63,
  MinCSS$OverscrollBehavior = 63,
  MinOmniboxSupportDeletable = 63,
  Min$addEventListener$IsInStrictMode = 64, // otherwise addEventListener has null .caller and null .arguments
  MinCSS$textDecorationSkipInk = 64,
  MinNoMultipleShadowRootsOfV0 = 64,
  MinEnsuredUnicodePropertyEscapesInRegExp = 64, // https://www.chromestatus.com/features/6706900393525248
  MinFocus3rdPartyIframeDirectly = 64, // even if EXPERIMENTAL; or need .contentWindow.focus()
  // a 3rd-party Vomnibar will trigger "navigation" and clear all logs in console on Chrome 64
  // this still occurs on Chrome 65.0.3325.181 (Stable, x64, Windows 10)
  VomnibarMayClearLog1 = 64,
  VomnibarMayClearLog2 = 65,
  // if #enable-md-extensions, it's there since C60
  MinEnsuredChromeURL$ExtensionShortcuts = 65,
  // the 2 below are correct even if EXPERIMENTAL or LEGACY
  MinCanNotRevokeObjectURLAtOnce = 65,
  MinExtraScrollbarWidthIfScrollStyleIsOverlay = 65,
  MinEnsuredDisplayContents = 65,
  // MinChar$At$InFaviconUrl = 65, // it may work but sometimes not, so '@1x' is necessary
  MinInputMode = 66, // even if LEGACY; still works on C35 if EXPERIMENTAL
  // @see MinEscapeHashInBodyOfDataURL
  // https://github.com/chromium/chromium/commit/511efa694bdf9fbed3dc83e3fa4cda12909ce2b6
  MinWarningOfEscapingHashInBodyOfDataURL = 66,
  // https://bugs.chromium.org/p/chromium/issues/detail?id=582245
  Min$ContentDocument$NotThrow = 67, // even if EXPERIMENTAL or LEGACY
  MinSlotIsNotDisplayContents = 67,
  Min$NotificationOptions$$isClickable$IsDeprecated = 67,
  // even if EXPERIMENTAL or LEGACY
  // but not on pages whose JS is disabled in chrome://settings/content/siteDetails?site=<origin>
  // issue: https://bugs.chromium.org/p/chromium/issues/detail?id=811528
  // the commit is firstly applied to C68:
  // https://github.com/chromium/chromium/commit/5a5267ab58dd0310fc2b427db30de60c0eea4457
  MinEnsuredNewScriptsFromExtensionOnSandboxedPage = 68, // extension can insert and run <script> correctly
  MinNo$TimerType$$Fake = MinEnsuredNewScriptsFromExtensionOnSandboxedPage,
  MinASameZoomOfDocElAsdevPixRatioWorksAgain = 68,
  // even if EXPERIMENTAL or LEGACY
  // also on pages with JS disabled in chrome://settings/content/siteDetails?site=<origin>
  NoRAFOrRICOnSandboxedPage = 69,
  MinTabIdMayBeMuchLarger = 69,
  // `>>>` only works if EXPERIMENTAL before C69 and since C56
  // (MinStaticSelector$GtGtGt$IfFlag$ExperimentalWebPlatformFeatures$Enabled)
  // https://github.com/chromium/chromium/commit/c81707c532183d4e6b878041964e85b0441b9f50
  MinNoSelector$GtGtGt = 69,
  // if an element has position:absolute and is at the right/bottom edge, it won't cause the page shows a scrollbar
  MinAbsolutePositionNotCauseScrollbar = 69, // even if EXPERIMENTAL or LEGACY
  // https://github.com/chromium/chromium/commit/6a866d29f4314b990981119285da46540a50742c
  MinFramesetHasNoNamedGetter = 70,
  MinContainLayoutBreakUIBox = 70, // even if EXPERIMENTAL
  Min$NotificationOptions$$silent = 70,
  // if `toggleCS` repeatedly, then a 3rd-party iframe gets a new CS later than its owner top frame
  // and if reopenTab, the CS is synced among frames again
  MinIframeInRestoredSessionTabHasPreviousTopFrameContentSettings = 70, // even if EXPERIMENTAL or LEGACY
  // means unprefixed properties and event name
  MinEnsured$Document$$fullscreenElement = 71, // even if LEGACY; MinMaybe$Document$$fullscreenElement=61
  Min$Tabs$$Update$DoesNotAcceptJavaScriptURLs = 71,
  MinTabIdBeSmallAgain = 71,
  Min$Tabs$$goBack = 72, // and tabs.goForward; even if EXPERIMENTAL or LEGACY
  // https://www.chromestatus.com/features/5656049583390720
  // deprecation is since C66
  MinEscapeHashInBodyOfDataURL = 72,
  // https://bugs.chromium.org/p/chromium/issues/detail?id=908809 seems related with it
  MinElement$Focus$MayMakeArrowKeySelectIt = 72, // if only EXPERIMENTAL (feature #KeyboardFocusableScrollers)
  // https://www.chromestatus.com/features/6569666117894144
  // https://bugs.chromium.org/p/chromium/issues/detail?id=179006#c45
  MinSpecCompliantShadowBlurRadius = 73,
  // re-implement extension APIs into C++ bindings: https://bugs.chromium.org/p/chromium/issues/detail?id=763564
  MinEnsuredNativeCrxBindings = 73, // even if LEGACY
  // source code of this change is between chromium/master@{#626128} and {#626161} (included)
  /** Related: https://chromium.googlesource.com/chromium/src/+/0146a7468d623a36bcb55fc6ae69465702bae7fa%5E%21/#F18
   * Stack Trace:
   * * an `<iframe>` has `embedded_content_view_` member, and has `.IsDisplayNone: () => !embedded_content_view_`
   * * if `.style.display` is updated, its `LayoutEmbeddedContent` layout instance is destroyed
   * * so call `HTMLFrameOwnerElement::SetEmbeddedContentView`, and then `FrameOwnerPropertiesChanged`
   * * in `LocalFrameClientImpl::DidChangeFrameOwnerProperties`, a new `WebFrameOwnerProperties` is created
   *   * it has the latest "is_display_none" state and is passed to `RenderFrameImpl::DidChangeFrameOwnerProperties`
   * * then `ConvertWebFrameOwnerPropertiesToFrameOwnerProperties` is used to convert message classes
   *   * the default value of `FrameOwnerProperties::is_display_none` and `Web~::~` is `false`
   *   * the old code does not sync `.is_display_none`
   *   * this commit 0146a74 begins to update `FrameOwnerProperties::is_display_none`
   * * the child frame gets notified and runs `RenderFrameHostImpl::OnDidChangeFrameOwnerProperties`
   * * `FrameTreeNode::set_frame_owner_properties` is called, and then
   *   * `OnSetFrameOwnerProperties` of either `RenderFrameImpl` or `RenderFrameProxy` is called
   *   * run `WebFrame::SetFrameOwnerProperties` to notify changes and recalc styles
   */
  MinNoFocusOrSelectionStringOnHiddenIFrame = 74, // even if EXPERIMENTAL or LEGACY
  // https://www.chromestatus.com/features/5650553247891456
  // https://docs.google.com/document/d/1CJgCg7Y31v5MbO14RDHyBAa5Sf0ZnPVtZMiOFCNbgWc/edit
  MinMaybeScrollEndAndOverScrollEvents = 74, // if EXPERIMENTAL
  // the below 3 are even if EXPERIMENTAL or LEGACY
  MinMediaQuery$PrefersReducedMotion = 74,
  // https://chromium.googlesource.com/chromium/src/+/5e84b7a819637ed4dd8f9c4d11288127663c8267
  MinBlockAutoFocusingInCrossOriginFrame = 75,
  MinMediaQuery$PrefersColorScheme = 76,
  // it's said the deadline is C73 in https://www.chromestatus.com/features/4507242028072960
  // but no source code in Chromium to disable it (tested on 2019-03-13)
  MinNoShadowDOMv0 = 80,
  // ses https://bugs.chromium.org/p/chromium/issues/detail?id=968651&can=2&q=reduced-motion%20change
  // TODO: use a real version code when the bug report above is solved
  MinMediaChangeEventsOnBackgroundPage = 99,
  assumedVer = 999,
}
declare const enum FirefoxBrowserVer {
  MinEnsuredShadowDOMV1 = 63, // also DocumentOrShadowRoot::getSelection
  MinUsable$Navigator$$Clipboard = 63,
  MinMediaQuery$PrefersReducedMotion = 63,
  Min$Document$$FullscreenElement = 64,
  // Min$globalThis = 65, // should not export `globalThis` into the outside
  MinMediaQuery$PrefersColorScheme = 67,
  MinSupported = 64,
}
