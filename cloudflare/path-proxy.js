const PREFIX = "/projects/screenunderstand";
const ORIGIN = "https://screen-understanding-agent.pages.dev";

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (incoming.pathname === PREFIX) {
      incoming.pathname = `${PREFIX}/`;
      return Response.redirect(incoming.toString(), 301);
    }
    if (!incoming.pathname.startsWith(`${PREFIX}/`)) {
      return new Response("Not found", { status: 404 });
    }
    const upstream = new URL(ORIGIN);
    upstream.pathname = incoming.pathname.slice(PREFIX.length) || "/";
    upstream.search = incoming.search;
    return fetch(new Request(upstream, request));
  },
};
