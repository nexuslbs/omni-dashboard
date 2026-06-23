import { renderOverview } from "../pages/overview";
import { renderActions } from "../pages/actions";
import { renderThreads } from "../pages/threads";
import { renderMessages } from "../pages/messages";
import { renderKanban, renderKanbanDetail } from "../pages/kanban";
import { renderSchedule, renderScheduleDetail } from "../pages/schedule";
import { renderExplorer } from "../pages/explorer";
import { renderPrompt } from "../pages/prompt";
import { renderSettings } from "../pages/settings";
import { renderMemory } from "../pages/memory";
import { renderProfiles } from "../pages/profiles";
import { renderChannels } from "../pages/channels";
import { renderPlatforms } from "../pages/platforms";
import { renderTools } from "../pages/tools";
import { renderProviders } from "../pages/providers";

type PageRenderer = (container: HTMLElement) => void;
type ParamPageRenderer = (container: HTMLElement, param: string) => void;

interface Route {
  name: string;
  handler: PageRenderer;
}

interface ParamRoute {
  prefix: string;
  handler: ParamPageRenderer;
}

const routes: Route[] = [
  { name: "overview", handler: renderOverview },
  { name: "threads", handler: renderThreads },
  { name: "messages", handler: renderMessages },
  { name: "memory", handler: renderMemory },
  { name: "kanban", handler: renderKanban },
  { name: "schedule", handler: renderSchedule },
  { name: "settings", handler: renderSettings },
  { name: "explorer", handler: renderExplorer },
  { name: "prompt", handler: renderPrompt },
  { name: "profiles", handler: renderProfiles },
  { name: "channels", handler: renderChannels },
  { name: "platforms", handler: renderPlatforms },
  { name: "tools", handler: renderTools },
  { name: "providers", handler: renderProviders },
  { name: "actions", handler: renderActions },
];

const paramRoutes: ParamRoute[] = [
  { prefix: "kanban/", handler: renderKanbanDetail },
  { prefix: "schedule/", handler: renderScheduleDetail },
];

function createRouter() {
  const content = document.getElementById("main-content")!;

  return {
    go(route: string) {
      // Check parameterized routes first
      for (const pr of paramRoutes) {
        if (route.startsWith(pr.prefix)) {
          const param = route.slice(pr.prefix.length);
          pr.handler(content, param);
          return;
        }
      }

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
