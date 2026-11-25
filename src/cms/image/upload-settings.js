// How the editor converts an image before it is uploaded (ADR 0022): the longest side and the
// quality an Admin sets in the core's settings group `imageUpload`, each with its default and its
// bounds as the core declares them, which the intake holds the settings file to as well.

import declaration from '../../format/settings-groups.json' with { type: 'json' };

export const IMAGE_UPLOAD = 'imageUpload';

const SETTINGS = declaration[IMAGE_UPLOAD].settings;

// Each setting as `settings.json` holds it in the source, which holds only what differs from a
// default: the value where it is a whole number within its bounds, else the default. A value the
// intake would refuse is not guessed at.
export function uploadSettingsOf(settings) {
  const group = settings?.[IMAGE_UPLOAD];
  const held = group !== null && typeof group === 'object' && !Array.isArray(group) ? group : {};
  return Object.fromEntries(Object.entries(SETTINGS).map(([name, { min, max, default: preset }]) => {
    const value = held[name];
    return [name, Number.isSafeInteger(value) && value >= min && value <= max ? value : preset];
  }));
}
