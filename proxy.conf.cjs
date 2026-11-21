module.exports = {
  '/api/core/search/works': {
    target: 'https://api.core.ac.uk',
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace('/api/core/search/works', '/v3/search/works'),
  },
};
