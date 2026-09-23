const keyFor = (role) => `pams.signatory.${role}`;

export const getStickySignatory = (role, fallback = {}) => {
  try {
    const saved = window.localStorage.getItem(keyFor(role));
    // A saved document is authoritative; only use the remembered value when
    // this form section is blank (for example, on a new form).
    if (fallback.name || fallback.designation || fallback.position) return fallback;
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
};

export const saveStickySignatory = (role, signatory) => {
  try {
    window.localStorage.setItem(keyFor(role), JSON.stringify(signatory));
  } catch {
    // The form remains usable if browser storage is unavailable.
  }
};
