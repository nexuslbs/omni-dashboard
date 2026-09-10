/**
 * Shared modal overlay behavior for the dashboard.
 *
 * Every dashboard modal is a full-screen overlay (`position: fixed; inset: 0`)
 * with a panel inside it. Two behaviors are shared by ALL of them:
 *
 * 1. Internal scrolling: a panel taller than the viewport scrolls its own
 *    content instead of overflowing the page, so the footer with
 *    Confirm/Cancel (and every other action) stays reachable on small or
 *    mobile viewports. `max-height` uses dynamic viewport units (`dvh`) so
 *    mobile browser chrome cannot push the footer off-screen.
 * 2. Page scroll lock: while a modal is open the page behind it must NOT
 *    scroll (the scroll wheel / touch on the overlay only moves the overlay
 *    or the modal body, never the page).
 *
 * Most modals are built in JS with inline `cssText` styles and do not share a
 * CSS class, so `initModalScrollLock()` installs ONE DOM watcher that tags any
 * overlay-shaped element with `.omni-modal` (panel gets `.omni-modal-panel`).
 * The CSS contract in `src/style.css` then fixes all of them, including
 * modals added in the future. `openModal`/`closeModal`/`destroyModal` update
 * the lock synchronously for code paths that want it immediately.
 */

/** Selector for overlays that lock the page behind them while open. */
export const MODAL_SELECTOR = ".modal-backdrop, .modal-overlay, .upload-modal-backdrop, .omni-modal";

const OVERLAY_CLASS = "omni-modal";
const PANEL_CLASS = "omni-modal-panel";

/** Fixed layers that must never be treated as modals. */
const NON_MODAL_RE = /dropdown|toast|float|banner|tooltip|pwa/i;

/**
 * Does this element look like a modal overlay?
 *
 * Class-based modals match directly. The JS-built modals are detected from
 * their inline style fingerprint (`position: fixed` + full-viewport inset,
 * which is exactly what every modal overlay uses and what non-modal fixed
 * layers such as the select dropdown do not).
 */
function isOverlayLike(el: Element): boolean {
  if (el.nodeType !== 1) return false;
  const he = el as HTMLElement;
  if (he.classList.contains(OVERLAY_CLASS)) return true;
  if (he.matches(".modal-backdrop, .modal-overlay, .upload-modal-backdrop")) return true;
  const style = he.getAttribute("style") || "";
  if (!/position\s*:\s*fixed/i.test(style)) return false;
  const coversViewport =
    /inset\s*:\s*0/i.test(style) ||
    (/top\s*:\s*0/i.test(style) && /left\s*:\s*0/i.test(style) && /right\s*:\s*0/i.test(style));
  if (!coversViewport) return false;
  if (NON_MODAL_RE.test(he.className || "")) return false;
  return true;
}

function decorateOverlay(el: HTMLElement): void {
  el.classList.add(OVERLAY_CLASS);
  const panel = el.firstElementChild as HTMLElement | null;
  if (panel) panel.classList.add(PANEL_CLASS);
}

/** Tag overlay-shaped elements below `root` so the shared CSS applies to them. */
export function decorateModals(root: ParentNode = document): void {
  if (root instanceof Element && isOverlayLike(root)) {
    decorateOverlay(root as HTMLElement);
  }
  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (isOverlayLike(el)) decorateOverlay(el);
  });
}

/** Is this overlay currently visible (open)? */
function isOpenOverlay(el: HTMLElement): boolean {
  if (el.hasAttribute("hidden")) return false;
  const cs = getComputedStyle(el);
  return cs.display !== "none" && cs.visibility !== "hidden";
}

/** Re-derive the page scroll lock from the overlays currently in the DOM. */
export function syncModalScrollLock(): void {
  const open = Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)).some(isOpenOverlay);
  document.body.classList.toggle("modal-open", open);
  document.documentElement.classList.toggle("modal-open", open);
}

/** Show an overlay (`display: flex`) and update the page scroll lock. */
export function openModal(el: HTMLElement | null): void {
  if (!el) return;
  decorateModals(el.parentElement || document);
  el.style.display = "flex";
  el.removeAttribute("hidden");
  syncModalScrollLock();
}

/** Hide an overlay (`display: none`) and update the page scroll lock. */
export function closeModal(el: HTMLElement | null): void {
  if (!el) return;
  el.style.display = "none";
  syncModalScrollLock();
}

/** Remove an overlay from the DOM and update the page scroll lock. */
export function destroyModal(el: HTMLElement | null): void {
  if (!el) return;
  el.remove();
  syncModalScrollLock();
}

let installed = false;

/**
 * Install the DOM watcher that keeps the modal CSS contract and the page
 * scroll lock in sync for every modal, present and future. Idempotent.
 */
export function initModalScrollLock(): void {
  decorateModals(document);
  syncModalScrollLock();
  if (installed || typeof MutationObserver === "undefined") return;
  installed = true;
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.type !== "childList") return;
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) decorateModals(node as Element);
      });
    });
    syncModalScrollLock();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "hidden", "class"],
  });
}
