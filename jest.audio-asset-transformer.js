module.exports = {
  process(_src, filename) {
    let hash = 0;
    for (let i = 0; i < filename.length; i += 1) {
      hash = (hash + filename.charCodeAt(i)) % 100000;
    }
    return { code: `module.exports = ${hash + 1};` };
  },
};
