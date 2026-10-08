import { RideEvents } from "./ride-events.js";

const $ = (id) => document.getElementById(id);

export class RidePresentation {
  constructor() {
    this.events = new RideEvents();
    this.panel = null;
    this.active = false;
    this.noticeTimer = null;
    this.sticky = false;
    this.headerActions = document.querySelector(".header-actions");
    this.brand = document.querySelector(".brand");
    for (const [button, panel] of [
      ["btn-data", "data"],
      ["btn-tools", "tools"],
    ])
      $(button).addEventListener("click", () =>
        this.open(this.panel === panel ? null : panel),
      );
    $("btn-close-data").addEventListener("click", () => this.close(true));
    $("btn-close-tools").addEventListener("click", () => this.close(true));
    $("btn-profile").addEventListener("click", () =>
      this.open(this.panel === "profile" ? null : "profile"),
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.panel) this.close(true);
    });
    document.addEventListener("click", (event) => {
      if (this.active && event.target === $("route-canvas")) this.close();
    });
  }
  enter({ demo }) {
    this.active = true;
    this.events.reset();
    this.hideNotice();
    $("ride-view-controls").append($("btn-camera"), $("btn-fullscreen"));
    this.brand.setAttribute("tabindex", "-1");
    this.brand.setAttribute("aria-hidden", "true");
    this.open(demo ? null : "tools");
  }
  exit() {
    this.active = false;
    this.close();
    this.hideNotice();
    this.headerActions.append($("btn-camera"), $("btn-fullscreen"));
    this.brand.removeAttribute("tabindex");
    this.brand.removeAttribute("aria-hidden");
  }
  open(panel) {
    this.panel = panel;
    $("ride-data").hidden = panel !== "data";
    $("ride-tools").hidden = panel !== "tools";
    document.body.classList.toggle("profile-expanded", panel === "profile");
    document.body.classList.toggle("ride-panel-open", panel === "tools");
    for (const [button, name] of [
      ["btn-data", "data"],
      ["btn-tools", "tools"],
      ["btn-profile", "profile"],
    ])
      $(button).setAttribute("aria-expanded", String(panel === name));
    $("profile-chevron").textContent = panel === "profile" ? "⌄" : "⌃";
    if (panel) this.hideNotice();
    else if (this.active && this.sticky)
      document.querySelector(".phase-card").hidden = false;
  }
  close(restoreFocus = false) {
    const button = {
      data: "btn-data",
      tools: "btn-tools",
      profile: "btn-profile",
    }[this.panel];
    this.open(null);
    if (restoreFocus && button) $(button).focus();
  }
  hideNotice() {
    clearTimeout(this.noticeTimer);
    document.querySelector(".phase-card").hidden = true;
  }
  update(state) {
    if (!this.active) return;
    const event = this.events.update(state);
    this.sticky = state.status !== "running";
    if (!event) return;
    $("event-reason").textContent = event.reason;
    if (this.panel) return;
    this.hideNotice();
    document.querySelector(".phase-card").hidden = false;
    $("ride-announcement").textContent =
      `${event.reason}. ${state.sample.phase}. ${$("event-detail").textContent}`;
    if (!event.sticky)
      this.noticeTimer = setTimeout(() => {
        document.querySelector(".phase-card").hidden = true;
      }, 4500);
  }
}
