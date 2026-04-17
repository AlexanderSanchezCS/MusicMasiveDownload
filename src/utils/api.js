function buildApiUrl(base, path) {
  return `${base.replace(/\/$/, '')}/api/${path}`;
}

export { buildApiUrl };