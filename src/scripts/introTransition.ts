/** Isolate the violet logo from the neutral background of intro.mp4's last frame. */
function captureLogo(video: HTMLVideoElement) {
  const frame = document.createElement("canvas");
  frame.width = video.videoWidth;
  frame.height = video.videoHeight;
  const context = frame.getContext("2d", { willReadFrequently: true });
  if (!context || !frame.width || !frame.height) return null;

  context.drawImage(video, 0, 0);
  const pixels = context.getImageData(0, 0, frame.width, frame.height);
  let left = frame.width, top = frame.height, right = 0, bottom = 0;

  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const i = (y * frame.width + x) * 4;
      const violet = Math.max(pixels.data[i], pixels.data[i + 2]) - pixels.data[i + 1];
      const alpha = Math.min(1, Math.max(0, (violet - 10) / 24));
      pixels.data[i + 3] = Math.round(alpha * 255);
      if (alpha > 0) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right <= left || bottom <= top) return null;
  context.putImageData(pixels, 0, 0);
  const logo = document.createElement("canvas");
  logo.width = right - left + 1;
  logo.height = bottom - top + 1;
  const logoContext = logo.getContext("2d");
  if (!logoContext) return null;
  logoContext.drawImage(frame, left, top, logo.width, logo.height, 0, 0, logo.width, logo.height);
  return { logo, left, top };
}

/** Fly the final frame into the visible navbar logo, then hand over to the real image. */
export async function transitionIntroToLogo(video: HTMLVideoElement, overlay: HTMLElement) {
  const target = Array.from(document.querySelectorAll<HTMLImageElement>("[data-intro-logo] img"))
    .find((image) => image.getBoundingClientRect().width > 0);
  if (!target?.complete || !target.naturalWidth) return false;

  const frame = captureLogo(video);
  if (!frame) return false;

  const source = video.getBoundingClientRect();
  const destination = target.getBoundingClientRect();
  if (!source.width || !destination.width || destination.bottom <= 0) return false;

  // object-fit: contain may leave space inside the video element.
  const ratio = Math.min(source.width / video.videoWidth, source.height / video.videoHeight);
  const width = frame.logo.width * ratio;
  const height = frame.logo.height * ratio;
  const left = source.left + (source.width - video.videoWidth * ratio) / 2 + frame.left * ratio;
  const top = source.top + (source.height - video.videoHeight * ratio) / 2 + frame.top * ratio;
  const dx = destination.left + destination.width / 2 - left - width / 2;
  const dy = destination.top + destination.height / 2 - top - height / 2;
  const scale = destination.width / width;

  const flyer = document.createElement("div");
  flyer.className = "intro-logo-transfer";
  flyer.setAttribute("aria-hidden", "true");
  Object.assign(flyer.style, {
    position: "fixed", left: `${left}px`, top: `${top}px`,
    width: `${width}px`, height: `${height}px`, zIndex: "10002",
    pointerEvents: "none", transformOrigin: "center", willChange: "transform",
  });
  Object.assign(frame.logo.style, { display: "block", width: "100%", height: "100%" });

  const arrivalLogo = new Image();
  arrivalLogo.src = target.currentSrc || target.src;
  arrivalLogo.alt = "";
  Object.assign(arrivalLogo.style, {
    position: "absolute", width: "100%", height: "auto", left: "0", top: "50%",
    transform: "translateY(-50%)", opacity: "0",
  });
  // Decode the cached navbar asset before hiding the original image.
  await arrivalLogo.decode();
  flyer.append(frame.logo, arrivalLogo);
  document.body.append(flyer);

  const targetVisibility = target.style.visibility;
  const videoVisibility = video.style.visibility;
  target.style.visibility = "hidden";
  video.style.visibility = "hidden";
  const animations: Animation[] = [];
  const finishEarly = () => animations.forEach((animation) => animation.finish());
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  try {
    const duration = 1200;
    animations.push(
      overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 650, easing: "ease-in-out", fill: "forwards",
      }),
      flyer.animate([
        { transform: "translate(0, 0) scale(1)" },
        { transform: `translate(${dx * .65}px, ${dy * .82}px) scale(${1 + (scale - 1) * .68})`, offset: .55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
      ], { duration, easing: "cubic-bezier(.45, 0, .2, 1)", fill: "forwards" }),
      frame.logo.animate([
        { opacity: 1 }, { opacity: 1, offset: .32 }, { opacity: 0, offset: .5 }, { opacity: 0 },
      ], { duration, fill: "forwards" }),
      arrivalLogo.animate([
        { opacity: 0 }, { opacity: 0, offset: .32 }, { opacity: 1, offset: .5 }, { opacity: 1 },
      ], { duration, fill: "forwards" }),
    );
    if (document.documentElement.classList.contains("theme-dark")) {
      animations.push(frame.logo.animate([
        { filter: "brightness(1) invert(0)" },
        { filter: "brightness(0) invert(1)" },
      ], { duration: 650, easing: "ease-in-out", fill: "forwards" }));
    }
    // A rotation or resize must never leave the logo at an obsolete position.
    window.addEventListener("resize", finishEarly, { once: true });
    reducedMotion.addEventListener("change", finishEarly, { once: true });
    await Promise.all(animations.map((animation) => animation.finished));
    return true;
  } finally {
    overlay.hidden = true;
    target.style.visibility = targetVisibility;
    video.style.visibility = videoVisibility;
    flyer.remove();
    animations.forEach((animation) => animation.cancel());
    window.removeEventListener("resize", finishEarly);
    reducedMotion.removeEventListener("change", finishEarly);
  }
}
