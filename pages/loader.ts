/// <reference path="../types/base/index.d.ts" />
/// <reference path="../types/lib/index.d.ts" />
/// <reference path="../types/build/index.d.ts" />
/// <reference path="../background/bg.d.ts" />
/// <reference path="../background/utils.ts" />
/// <reference path="../background/settings.ts" />
/// <reference path="../lib/dom_utils.ts" />
var VimiumInjector: VimiumInjectorTy | undefined | null = null;
if (!(Build.BTypes & ~BrowserType.Chrome) ? false : !(Build.BTypes & BrowserType.Chrome) ? true
    : typeof browser !== "undefined" && browser && (browser as typeof chrome).runtime) {
  window.chrome = browser as typeof chrome;
}
window.chrome && chrome.runtime && chrome.runtime.getManifest && (function () {
  let loader = document.currentScript as HTMLScriptElement;
  const head = loader.parentElement as HTMLElement
    , scripts: HTMLScriptElement[] = [loader]
    , prefix = chrome.runtime.getURL("")
    , arr = chrome.runtime.getManifest().content_scripts[0].js;
  if (!(Build.BTypes & BrowserType.Edge)) {
    for (const src of arr) {
      const scriptElement = document.createElement("script");
      scriptElement.async = false;
      scriptElement.src = src[0] === "/" || src.lastIndexOf(prefix, 0) === 0 ? src : "/" + src;
      scripts.push(scriptElement);
    }
    scripts[scripts.length - 1].onload = onLastLoad;
    // wait a while so that the page gets ready earlier
    setTimeout(function (): void {
      for (const scriptEl of scripts) {
        head.appendChild(scriptEl);
      }
    }, 100);
  }
  interface BgWindow extends Window { Settings_: typeof Settings_; }
  function onLastLoad(): void {
    for (let i = scripts.length; 0 <= --i; ) { scripts[i].remove(); }
    const dom = (window as {} as {VDom?: typeof VDom}).VDom;
    dom && (dom.allowScripts_ = 0);
    let bg: BgWindow;
    if (Build.BTypes & BrowserType.Firefox && Build.MayOverrideNewTab
        && (bg = chrome.extension.getBackgroundPage() as BgWindow)
        && bg.Settings_ && bg.Settings_.CONST_.OverrideNewTab_
        && location.pathname.indexOf("newtab") >= 0) {
      setTimeout(function (): void {
        const hud = (window as {} as {VHud?: VHUDTy}).VHud;
        hud && hud.tip_("Not allowed to open the target new tab URL", 2560);
      }, 100);
    }
  }
  if (location.pathname.toLowerCase().indexOf("options") < 0) {
    const bg = chrome.extension.getBackgroundPage() as BgWindow;
    if (bg && bg.Backend_) {
      const uiStyles = bg.Settings_.omniPayload_.s;
      if (uiStyles && ` ${uiStyles} `.indexOf(" dark ") >= 0) {
        const style = document.createElement("style");
        style.textContent = "body { background: #202124; color: #aab0b6; }";
        (document.head as HTMLHeadElement).appendChild(style);
      }
    }
  }
  if (!Build.NDEBUG) {
    (window as {} as {updateUI(): void}).updateUI = function (): void {
      const settings = (chrome.extension.getBackgroundPage() as BgWindow).Settings_;
      delete (settings.cache_ as FullSettings).helpDialog;
      delete (settings.cache_ as FullSettings).exclusionTemplate;
      settings.fetchFile_("baseCSS", function (): void {
        settings.postUpdate_("userDefinedCss");
      });
    };
    interface WindowExForDebug extends Window { a: unknown; cb: (i: any) => void; }
    (window as WindowExForDebug).a = null;
    (window as WindowExForDebug).cb = function (b) { (window as WindowExForDebug).a = b; console.log("%o", b); };
  }
  function next(index: number): void {
    if (index >= arr.length) {
      return onLastLoad();
    }
    const scriptElement = document.createElement("script"), src = arr[index];
    scriptElement.src = src[0] === "/" || src.lastIndexOf(prefix, 0) === 0 ? src : "/" + src;
    scriptElement.onload = () => next(index + 1);
    scripts.push(scriptElement);
    head.appendChild(scriptElement);
  }
  if (Build.BTypes & BrowserType.Edge) {
    setTimeout(function (): void {
      next(0);
    }, 100);
  }
})();
