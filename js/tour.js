const KEY = "yahooligan.tour.seen";
const STEPS = [
  [
    "#profile",
    "Choose your ride",
    "Pick an easy spin, rolling hills, a climb or intervals. The profile shapes your timed workout.",
  ],
  [
    ".field-row",
    "Set your time and starting hill",
    "Choose 5–180 minutes, including warm-up and cool-down. Starting grade sets your initial resistance in SIM mode.",
  ],
  [
    "#start-watts",
    "Choose your starting power",
    "This is your baseline watt target for ERG. Harder and easier phases adjust the target from here.",
  ],
  [
    ".mode-switch",
    "Hills or target watts?",
    "SIM makes resistance follow the hills. ERG asks your KICKR to hold the scheduled watt target.",
  ],
  [
    "#btn-prepare",
    "Connect, then start",
    "Prepare your workout, connect your KICKR in Ride tools, and press Start ride. You can also connect a heart-rate monitor.",
  ],
  [
    "#btn-demo",
    "Try the road first",
    "Demo lets you explore without a trainer. New scenery changes the landscape while keeping your workout targets. Next, we’ll preview the ride controls.",
  ],
  [
    ".metrics",
    "Your essentials stay visible",
    "Power, cadence, heart rate and grade or watts stay at the top. Landscape adds speed, distance and elapsed time. Live speed comes from your trainer; demo speed is simulated.",
    "ride",
  ],
  [
    "#btn-profile",
    "See what’s ahead",
    "The strip shows the course, your progress and current phase. Tap it to expand the chart. Brief panels announce new minutes and effort changes.",
    "ride",
  ],
  [
    "#ride-view-controls",
    "Choose your view",
    "Ride data opens more measurements. Switch between cyclist and first-person views, or use fullscreen. The logo stays out of your way.",
    "ride",
  ],
  [
    "#ride-tools",
    "Connections, scenery and saving",
    "Ride tools holds trainer connections, SIM/ERG, sky and weather, Finish ride, TCX download and New workout. Use the Strava link to upload your saved file.",
    "tools",
  ],
  [
    "#btn-start",
    "Stay in control",
    "Start here after connecting. During a ride this becomes Pause or Resume. Calls don’t pause progress, and running rides request a screen wake lock. You’re ready to build your workout.",
    "ride",
  ],
];

export class WorkoutTour {
  constructor({ preview }) {
    this.preview = preview;
    this.previewActive = false;
    this.dialog = document.getElementById("tour");
    this.card = document.getElementById("tour-card");
    this.spotlight = document.getElementById("tour-spotlight");
    this.index = 0;
    document
      .getElementById("btn-tour")
      .addEventListener("click", () => this.start());
    document
      .getElementById("tour-next")
      .addEventListener("click", () => this.move(1));
    document
      .getElementById("tour-back")
      .addEventListener("click", () => this.move(-1));
    document
      .getElementById("tour-skip")
      .addEventListener("click", () => this.close());
    this.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close();
    });
    this.dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        this.move(event.key === "ArrowRight" ? 1 : -1);
      }
    });
    this.position = this.position.bind(this);
    window.addEventListener("resize", this.position);
    window.visualViewport?.addEventListener("resize", this.position);
    document.addEventListener("scroll", this.position, true);
    setTimeout(() => {
      try {
        if (!localStorage.getItem(KEY)) this.start(true);
      } catch {
        /* Manual tour works when storage is blocked. */
      }
    }, 350);
  }
  start(automatic = false) {
    if (this.dialog.open || document.getElementById("setup-panel").hidden)
      return;
    try {
      localStorage.setItem(KEY, "seen");
    } catch {
      if (automatic) return;
    }
    this.scroll = { x: scrollX, y: scrollY };
    this.index = 0;
    this.dialog.showModal();
    this.showStep();
    document.getElementById("tour-next").focus({ preventScroll: true });
  }
  move(direction) {
    if (this.index + direction >= STEPS.length) {
      this.close();
      return;
    }
    this.index = Math.max(0, this.index + direction);
    this.showStep();
    // Back can become disabled when returning to the first step.
    if (document.activeElement.disabled)
      document.getElementById("tour-next").focus({ preventScroll: true });
  }
  showStep() {
    const [selector, title, body, view] = STEPS[this.index];
    this.previewActive = !!view;
    this.preview(!!view, view === "tools" ? "tools" : null);
    this.target = document.querySelector(selector);
    document.getElementById("tour-title").textContent = title;
    document.getElementById("tour-body").textContent = body;
    document.getElementById("tour-count").textContent =
      `${this.index + 1} of ${STEPS.length}${view ? " · Ride preview" : ""}`;
    document.getElementById("tour-back").disabled = this.index === 0;
    document.getElementById("tour-next").textContent =
      this.index === STEPS.length - 1 ? "Finish tour" : "Next →";
    this.target.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    });
    this.position();
    requestAnimationFrame(this.position);
  }
  position() {
    if (!this.dialog.open || !this.target) return;
    const r = this.target.getBoundingClientRect(),
      padding = 6;
    const w = this.dialog.clientWidth,
      h = this.dialog.clientHeight;
    Object.assign(this.spotlight.style, {
      left: `${Math.max(4, r.left - padding)}px`,
      top: `${Math.max(4, r.top - padding)}px`,
      width: `${Math.min(w - 8, r.width + padding * 2)}px`,
      height: `${Math.min(h - 8, r.height + padding * 2)}px`,
    });
    const cw = this.card.offsetWidth,
      ch = this.card.offsetHeight;
    let left = (w - cw) / 2,
      top;
    if (w - r.right > cw + 30) {
      left = r.right + 20;
      top = (r.top + r.bottom - ch) / 2;
    } else if (r.left > cw + 30) {
      left = r.left - cw - 20;
      top = (r.top + r.bottom - ch) / 2;
    } else if (h - r.bottom > ch + 24) top = r.bottom + 18;
    else top = r.top - ch - 18;
    this.card.style.left = `${Math.max(12, Math.min(w - cw - 12, left))}px`;
    this.card.style.top = `${Math.max(12, Math.min(h - ch - 12, top))}px`;
  }
  close() {
    if (!this.dialog.open) return;
    this.previewActive = false;
    this.preview(false, null);
    this.dialog.close();
    window.scrollTo(this.scroll.x, this.scroll.y);
    document.getElementById("btn-tour").focus({ preventScroll: true });
  }
}
