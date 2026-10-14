import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let scrollTriggerInstance = null;
let resizeObserver = null;
let activeProgress = 0;

export function initProcessTimeline() {
  const grid = document.querySelector('.flow-steps-grid');
  if (!grid) return () => {};

  const stepCards = Array.from(grid.querySelectorAll('.flow-step-card'));
  if (stepCards.length < 5) return () => {};

  const svg = grid.querySelector('.flow-connector-svg');
  if (!svg) return () => {};

  const segmentGroups = Array.from(svg.querySelectorAll('.connector-segment-group'));
  const headCircle = svg.querySelector('.flow-connector-head');

  if (segmentGroups.length < 4 || !headCircle) return () => {};

  const segments = segmentGroups.map(group => ({
    group,
    basePath: group.querySelector('.flow-connector-path.base-path'),
    glowPath: group.querySelector('.flow-connector-path.glow-path'),
    activePath: group.querySelector('.flow-connector-path.active-path'),
    totalLength: 0
  }));

  // Reduced motion preference check
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    segments.forEach(seg => {
      seg.basePath.style.display = 'block';
      seg.glowPath.style.display = 'none';
      seg.activePath.style.strokeDashoffset = '0';
      seg.activePath.style.strokeDasharray = 'none';
    });
    headCircle.style.display = 'none';
    stepCards.forEach(c => c.classList.add('step-active'));
    return () => {};
  }

  let isVertical = true;

  // Track activation and pulse timers per step card to eliminate DOM thrashing
  const stepActiveStates = [true, false, false, false, false];
  const pulseTimers = [null, null, null, null, null];

  function updateGeometry() {
    const svgRect = svg.getBoundingClientRect();
    const imgWrappers = stepCards.map(c => c.querySelector('.flow-img-wrapper'));
    const textWrappers = stepCards.map(c => c.querySelector('.flow-text-content'));

    const r0 = imgWrappers[0].getBoundingClientRect();
    const r1 = imgWrappers[1].getBoundingClientRect();

    // Vertical for mobile/tablet <= 992px, horizontal for desktop > 992px
    isVertical = Math.abs(r1.top - r0.top) > Math.abs(r1.left - r0.left);

    const radius = r0.width / 2;

    const centers = imgWrappers.map(w => {
      const r = w.getBoundingClientRect();
      return {
        x: r.left - svgRect.left + r.width / 2,
        y: r.top - svgRect.top + r.height / 2
      };
    });

    if (isVertical) {
      // -------------------------------------------------------------
      // MOBILE / TABLET: S-SHAPED ALTERNATING CURVED PATHWAYS
      // Step 01 -> Step 02: Curve Right
      // Step 02 -> Step 03: Curve Left
      // Step 03 -> Step 04: Curve Right
      // Step 04 -> Step 05: Curve Left
      // -------------------------------------------------------------
      for (let k = 0; k < 4; k++) {
        const cStart = centers[k];
        const cEnd = centers[k + 1];
        const isRightSide = (k % 2 === 0);

        const t1Rect = textWrappers[k].getBoundingClientRect();
        const t2Rect = textWrappers[k + 1].getBoundingClientRect();

        let startX, startY, endX, endY, targetApexX;

        if (isRightSide) {
          // Right edge of Circle k -> Right edge of Circle k+1
          startX = cStart.x + radius;
          startY = cStart.y;
          endX = cEnd.x + radius;
          endY = cEnd.y;

          const maxTextRight = Math.max(t1Rect.right, t2Rect.right) - svgRect.left;
          const maxAvailableX = svgRect.width - 12;
          targetApexX = Math.min(maxAvailableX, Math.max(startX + 38, maxTextRight + 22));
        } else {
          // Left edge of Circle k -> Left edge of Circle k+1
          startX = cStart.x - radius;
          startY = cStart.y - 4;
          endX = cEnd.x - radius;
          endY = cEnd.y - 4;

          const minTextLeft = Math.min(t1Rect.left, t2Rect.left) - svgRect.left;
          const minAvailableX = 12;
          targetApexX = Math.max(minAvailableX, Math.min(startX - 38, minTextLeft - 22));
        }

        const deltaY = endY - startY;

        // Exact cubic Bézier formulation: apex reaches targetApexX at t=0.5
        const xCtrl = (4 * targetApexX - startX) / 3;
        const yCtrl1 = startY + deltaY * 0.18;
        const yCtrl2 = endY - deltaY * 0.18;

        const pathD = `M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${xCtrl.toFixed(1)} ${yCtrl1.toFixed(1)}, ${xCtrl.toFixed(1)} ${yCtrl2.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`;

        const seg = segments[k];
        seg.basePath.setAttribute('d', pathD);
        seg.glowPath.setAttribute('d', pathD);
        seg.activePath.setAttribute('d', pathD);

        seg.totalLength = seg.activePath.getTotalLength() || 1;
        seg.activePath.style.strokeDasharray = `${seg.totalLength.toFixed(1)}`;
        seg.glowPath.style.strokeDasharray = `${seg.totalLength.toFixed(1)}`;
      }
    } else {
      // -------------------------------------------------------------
      // DESKTOP: HORIZONTAL CONNECTORS BETWEEN STEP CIRCLES
      // -------------------------------------------------------------
      for (let k = 0; k < 4; k++) {
        const cStart = centers[k];
        const cEnd = centers[k + 1];

        const startX = cStart.x + radius;
        const startY = cStart.y;
        const endX = cEnd.x - radius;
        const endY = cEnd.y;

        const pathD = `M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)}`;

        const seg = segments[k];
        seg.basePath.setAttribute('d', pathD);
        seg.glowPath.setAttribute('d', pathD);
        seg.activePath.setAttribute('d', pathD);

        seg.totalLength = seg.activePath.getTotalLength() || 1;
        seg.activePath.style.strokeDasharray = `${seg.totalLength.toFixed(1)}`;
        seg.glowPath.style.strokeDasharray = `${seg.totalLength.toFixed(1)}`;
      }
    }

    renderProgress(activeProgress);
  }

  function renderProgress(progress) {
    activeProgress = Math.max(0, Math.min(1, progress));

    // Step 01 is always illuminated (origin)
    stepCards[0].classList.add('step-active');

    // 1. Update each of the 4 segments drawing progress
    for (let k = 0; k < 4; k++) {
      const seg = segments[k];
      const segStart = k * 0.25;
      const segEnd = (k + 1) * 0.25;

      let segP = 0;
      if (activeProgress >= segEnd) {
        segP = 1;
      } else if (activeProgress <= segStart) {
        segP = 0;
      } else {
        segP = (activeProgress - segStart) / 0.25;
      }

      const drawLength = seg.totalLength * segP;
      const offset = Math.max(0, seg.totalLength - drawLength);

      seg.activePath.style.strokeDashoffset = `${offset.toFixed(1)}`;
      seg.glowPath.style.strokeDashoffset = `${offset.toFixed(1)}`;

      // 2. State-guarded step activation to prevent DOM thrashing
      const stepIdx = k + 1;
      const targetCard = stepCards[stepIdx];
      const activationThreshold = (k + 1) * 0.25 - 0.012;

      if (activeProgress >= activationThreshold) {
        if (!stepActiveStates[stepIdx]) {
          stepActiveStates[stepIdx] = true;
          targetCard.classList.add('step-active', 'pulse-highlight');
          if (pulseTimers[stepIdx]) clearTimeout(pulseTimers[stepIdx]);
          pulseTimers[stepIdx] = setTimeout(() => {
            targetCard.classList.remove('pulse-highlight');
            pulseTimers[stepIdx] = null;
          }, 600);
        }
      } else {
        if (stepActiveStates[stepIdx]) {
          stepActiveStates[stepIdx] = false;
          if (pulseTimers[stepIdx]) {
            clearTimeout(pulseTimers[stepIdx]);
            pulseTimers[stepIdx] = null;
          }
          targetCard.classList.remove('step-active', 'pulse-highlight');
        }
      }
    }

    // 3. Smooth, continuous leading-edge light bead tracking
    // Seamless handoff: As bead reaches step boundary, it smoothly docks/merges (opacity 1 -> 0)
    // while the step card illuminates, and emerges from the departure edge (opacity 0 -> 1)
    if (activeProgress > 0.005 && activeProgress < 0.999) {
      let activeSegIndex = Math.min(3, Math.floor(activeProgress * 4));
      // Clamp boundary edge to the completing segment
      if (activeProgress === 0.25) activeSegIndex = 0;
      else if (activeProgress === 0.50) activeSegIndex = 1;
      else if (activeProgress === 0.75) activeSegIndex = 2;

      const seg = segments[activeSegIndex];
      const localP = Math.max(0, Math.min(1, (activeProgress - activeSegIndex * 0.25) / 0.25));

      try {
        const drawLen = seg.totalLength * localP;
        const pt = seg.activePath.getPointAtLength(Math.min(drawLen, seg.totalLength));
        headCircle.setAttribute('cx', pt.x.toFixed(1));
        headCircle.setAttribute('cy', pt.y.toFixed(1));

        // Smooth opacity ramp for seamless visual transitions without coordinate jumping
        let beadOpacity = 1;
        if (activeSegIndex === 0) {
          if (localP < 0.05) beadOpacity = localP / 0.05;
          else if (localP > 0.95) beadOpacity = (1 - localP) / 0.05;
        } else if (activeSegIndex === 3) {
          if (localP < 0.05) beadOpacity = localP / 0.05;
          // Remains full opacity when docking at Step 05
          else beadOpacity = 1;
        } else {
          // Segments 1 and 2: gentle fade-in from previous circle, gentle fade-out into next circle
          if (localP < 0.05) beadOpacity = localP / 0.05;
          else if (localP > 0.95) beadOpacity = (1 - localP) / 0.05;
        }

        headCircle.style.opacity = beadOpacity.toFixed(2);
      } catch (_) {
        headCircle.style.opacity = '0';
      }
    } else if (activeProgress >= 0.999) {
      // Dock cleanly at the final step (Step 05)
      try {
        const lastSeg = segments[3];
        const pt = lastSeg.activePath.getPointAtLength(lastSeg.totalLength);
        headCircle.setAttribute('cx', pt.x.toFixed(1));
        headCircle.setAttribute('cy', pt.y.toFixed(1));
        headCircle.style.opacity = '1';
      } catch (_) {
        headCircle.style.opacity = '0';
      }
    } else {
      headCircle.style.opacity = '0';
    }
  }

  function setupScrollTrigger() {
    if (scrollTriggerInstance) {
      scrollTriggerInstance.kill();
      scrollTriggerInstance = null;
    }

    if (isVertical) {
      // Mobile / Tablet vertical layout:
      // Start when Step 01 reaches 58% of viewport, end when Step 05 reaches 58% of viewport
      // scrub: 0.6 provides silky-smooth follow motion with subtle natural delay
      scrollTriggerInstance = ScrollTrigger.create({
        trigger: stepCards[0],
        endTrigger: stepCards[stepCards.length - 1],
        start: 'center 58%',
        end: 'center 58%',
        scrub: 0.6,
        invalidateOnRefresh: true,
        fastScrollEnd: true,
        onUpdate: (self) => {
          renderProgress(self.progress);
        }
      });
    } else {
      // Desktop horizontal layout
      scrollTriggerInstance = ScrollTrigger.create({
        trigger: grid,
        start: 'top 75%',
        end: 'bottom 65%',
        scrub: 0.6,
        invalidateOnRefresh: true,
        fastScrollEnd: true,
        onUpdate: (self) => {
          renderProgress(self.progress);
        }
      });
    }
  }

  // Initial calculation and trigger setup
  updateGeometry();
  setupScrollTrigger();

  // Watch for layout / size changes (orientation, window resize)
  // Ignore mobile browser address bar collapse/expand (which only alters innerHeight)
  let lastWindowWidth = window.innerWidth;
  let lastGridWidth = grid.clientWidth;
  let resizeTimer = null;

  function handleResize(force = false) {
    const currentWindowWidth = window.innerWidth;
    const currentGridWidth = grid.clientWidth;

    // Filter out vertical-only height changes from mobile URL bar expansion/collapse
    if (!force && Math.abs(currentWindowWidth - lastWindowWidth) < 4 && Math.abs(currentGridWidth - lastGridWidth) < 4) {
      return;
    }

    lastWindowWidth = currentWindowWidth;
    lastGridWidth = currentGridWidth;

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      updateGeometry();
      setupScrollTrigger();
      ScrollTrigger.refresh();
    }, 150);
  }

  window.addEventListener('resize', () => handleResize(false), { passive: true });
  window.addEventListener('orientationchange', () => handleResize(true), { passive: true });
  window.addEventListener('load', () => handleResize(true), { passive: true });

  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (Math.abs(width - lastGridWidth) >= 4) {
          handleResize(true);
        }
      }
    });
    resizeObserver.observe(grid);
  }

  // Ensure initial render matches current scroll position
  setTimeout(() => {
    ScrollTrigger.refresh();
    if (scrollTriggerInstance) {
      renderProgress(scrollTriggerInstance.progress);
    }
  }, 200);

  return function destroyProcessTimeline() {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
    window.removeEventListener('load', handleResize);
    if (resizeObserver) resizeObserver.disconnect();
    if (scrollTriggerInstance) scrollTriggerInstance.kill();
    pulseTimers.forEach(t => { if (t) clearTimeout(t); });
  };
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProcessTimeline);
  } else {
    initProcessTimeline();
  }
}
