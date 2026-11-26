// The folder of the masters in the content folder, an image as the site shows
// it; no collection may take its name.
export const MEDIA_FOLDER = 'media';

// Where the source repository keeps the image library (ADR 0055), which no content file reads.
export const IMAGE_LIBRARY_FOLDER = 'image-library';

// The ten hexadecimal digits a master's name holds of its original's SHA-256.
export const hashDigits = (hash) => hash.slice(0, 10);
