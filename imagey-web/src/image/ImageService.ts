import ScaledImageContent from "./ScaledImageContent";

// Size and format of a public-profile avatar (see
// docs/plans/chat-public-profile.md §3.1/§10): a fixed square, re-encoded as
// WebP - like every other re-render in this module, this also strips
// EXIF/GPS metadata the original file might have carried.
const AVATAR_SIZE = 256;
const AVATAR_TYPE = "image/webp";
const AVATAR_QUALITY = 0.85;

export const imageService = {
  isImage: (type: string) => {
    const normalizedType = type.toLowerCase();
    return (
      normalizedType.startsWith("image/") && !normalizedType.includes("svg")
    ); // SVG omitted to prevent XSS
  },

  scale: async (imageFile: File): Promise<ScaledImageContent> => {
    const image = await loadImage(imageFile);
    const width = image.width;
    const height = image.height;
    const smallWidth = getSmallWidth(width, height);
    const smallHeight = getSmallHeight(width, height);
    const normalWidth = getNormalWidth(width, height);
    const normalHeight = getNormalHeight(width, height);
    const smallImage = await drawImage(image, smallWidth, smallHeight);
    const normalImage = await drawImage(image, normalWidth, normalHeight);
    URL.revokeObjectURL(image.src);
    return {
      smallImage,
      normalImage,
    };
  },

  // Center-crops `imageFile` to a square and re-renders it at a fixed small
  // size as WebP - the public-profile avatar (see
  // docs/plans/chat-public-profile.md §3.5, trigger 1).
  renderAvatar: async (imageFile: File): Promise<ArrayBuffer> => {
    const image = await loadImage(imageFile);
    const side = Math.min(image.width, image.height);
    const sx = (image.width - side) / 2;
    const sy = (image.height - side) / 2;
    const avatar = await drawImage(
      image,
      AVATAR_SIZE,
      AVATAR_SIZE,
      { sx, sy, sWidth: side, sHeight: side },
      AVATAR_TYPE,
      AVATAR_QUALITY,
    );
    URL.revokeObjectURL(image.src);
    return avatar;
  },
};

async function loadImage(imageFile: File) {
  const image = new Image();
  let imageLoaded: (image: HTMLImageElement) => void;
  let loadingError: (error: Event | string) => void;

  const loadingImage = new Promise<HTMLImageElement>(
    (resolve: (image: HTMLImageElement) => void, reject) => {
      imageLoaded = resolve;
      loadingError = reject;
    },
  );
  image.onload = () => {
    imageLoaded(image);
  };
  image.onerror = (e) => {
    loadingError(e);
  };
  image.src = URL.createObjectURL(imageFile);
  return await loadingImage;
}

async function drawImage(
  image: HTMLImageElement,
  width: number,
  height: number,
  // Source rectangle to sample from `image` instead of the whole thing -
  // used by renderAvatar to center-crop to a square. Interpreted in the
  // image's intrinsic pixels, unaffected by the width/height assignment
  // below (a source rect is always intrinsic-pixel-relative per spec).
  crop?: { sx: number; sy: number; sWidth: number; sHeight: number },
  type?: string,
  quality?: number,
): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    return Promise.reject("Could not create rendering context");
  }
  image.width = width;
  image.height = height;
  if (crop) {
    context.drawImage(
      image,
      crop.sx,
      crop.sy,
      crop.sWidth,
      crop.sHeight,
      0,
      0,
      width,
      height,
    );
  } else {
    context.drawImage(image, 0, 0, width, height);
  }
  let imageDrawn: (imageContent: ArrayBuffer) => void,
    drawingError: (reason: string) => void;
  const drawingResult = new Promise<ArrayBuffer>((resolve, reject) => {
    imageDrawn = resolve;
    drawingError = reject;
  });
  canvas.toBlob(
    async (blob: Blob | null) => {
      if (blob === null) {
        drawingError("Blob not created");
      } else {
        const content = await blob.arrayBuffer();
        imageDrawn(content);
      }
    },
    type,
    quality,
  );
  return drawingResult;
}

function getSmallWidth(width: number, height: number) {
  if (max(width, height) <= 480) {
    return width;
  }
  return width > height ? (width * 480) / height : 480;
}

function getSmallHeight(width: number, height: number) {
  if (max(width, height) <= 480) {
    return height;
  }
  return width > height ? 480 : (height * 480) / width;
}

function getNormalWidth(width: number, height: number) {
  if (max(width, height) <= 1024) {
    return width;
  }
  return width > height ? (width * 1024) / height : 1024;
}

function getNormalHeight(width: number, height: number) {
  if (max(width, height) <= 1024) {
    return height;
  }
  return width > height ? 1024 : (height * 1024) / width;
}

function max(width: number, height: number) {
  return width > height ? width : height;
}
