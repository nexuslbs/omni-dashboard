import { renderOverview } from "../pages/overview";
import { renderMessages } from "../pages/messages";
import { renderKanban } from "../pages/kanban";
import { renderSchedule } from "../pages/schedule";
import { renderWiki } from "../pages/wiki";

type PageRenderer = (container: HTMLElement) => void;

interface Route {
  name: string;
  handler: PageRenderer;
}

const routes: Route[] = [
  { name: "overview", handler: renderOverview },
  { name: "messages", handler: renderMessages },
  { name: "kanban", handler: renderKanban },
  { name: "schedule", handler: renderSchedule },
  { name: "wiki", handler: renderWiki },
];

function createRouter() {
  const content = document.getElementById("main-content")!;

  return {
    go(route: string) {
      // Check exact routes
      for (const r of routes) {
        if (r.name === route) {
          r.handler(content);
          return;
        }
      }

      content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;"><h2>404</h2><p>Page not found</p></div>`;
    },
  };
}

export const router = createRouter();
