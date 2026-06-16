import type { ReactLinuxEventHandler } from "./adapter";
import { createGnomeShellRoot } from "./gnomeShell";
import { Box, Button, Icon, Label, Progress, Separator } from "./primitives";
import type { CreateStAdapterOptions, GnomeShellActor, GnomeShellToolkit } from "./stAdapter";

export interface SampleTrayContainer {
  id: string;
  image: string;
  name: string;
  running: boolean;
}

export interface SampleTrayAppProps {
  containers?: SampleTrayContainer[];
  onOpenApp?: ReactLinuxEventHandler;
  onRefresh?: ReactLinuxEventHandler;
  title?: string;
}

const DEFAULT_CONTAINERS: SampleTrayContainer[] = [
  { id: "api", image: "node:24", name: "api", running: true },
  { id: "db", image: "postgres:17", name: "db", running: true },
  { id: "worker", image: "alpine:3", name: "worker", running: false },
];

export function SampleTrayApp({
  containers = DEFAULT_CONTAINERS,
  onOpenApp,
  onRefresh,
  title = "React Linux",
}: SampleTrayAppProps) {
  const runningCount = containers.filter((container) => container.running).length;

  return (
    <Box vertical styleClass="react-linux-shell-sample">
      <Box styleClass="react-linux-shell-sample-header">
        <Icon iconName="application-x-executable-symbolic" />
        <Label styleClass="react-linux-shell-sample-title">{title}</Label>
        <Button onClick={onRefresh} styleClass="react-linux-shell-sample-refresh">
          Refresh
        </Button>
      </Box>

      <Progress value={runningCount} max={containers.length || 1} styleClass="react-linux-shell-sample-progress" />
      <Separator />

      <Box vertical styleClass="react-linux-shell-sample-list">
        {containers.map((container) => (
          <Box
            key={container.id}
            styleClass={container.running ? "react-linux-shell-sample-row running" : "react-linux-shell-sample-row"}
          >
            <Label styleClass="react-linux-shell-sample-name">{container.name}</Label>
            <Label styleClass="react-linux-shell-sample-image">{container.image}</Label>
            <Label styleClass="react-linux-shell-sample-state">{container.running ? "running" : "stopped"}</Label>
          </Box>
        ))}
      </Box>

      <Separator />
      <Button onClick={onOpenApp} styleClass="react-linux-shell-sample-open">
        Open React Linux
      </Button>
    </Box>
  );
}

export function mountSampleTrayApp(
  container: GnomeShellActor,
  toolkit: GnomeShellToolkit,
  props: SampleTrayAppProps = {},
  options?: CreateStAdapterOptions,
) {
  const root = createGnomeShellRoot(container, toolkit, options);
  root.render(<SampleTrayApp {...props} />);
  return root;
}
