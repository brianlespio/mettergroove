/** Prefix a root-relative path with the site base. Local dev stays at `/`; GitHub Pages uses `/mettergroove/`. */
export function publicPath(path: string): string {
  const relative = path.startsWith('/') ? path.slice(1) : path;
  return `${import.meta.env.BASE_URL}${relative}`;
}
