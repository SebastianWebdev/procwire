import { NavLink, Stack } from "@mantine/core";
import {
  IconRocket,
  IconChartBar,
  IconGitCompare,
  IconTrendingUp,
} from "@tabler/icons-react";
import { useLocation, useNavigate } from "react-router-dom";

const navItems = [
  { path: "/run", label: "Run Benchmark", icon: IconRocket },
  { path: "/results", label: "Results", icon: IconChartBar },
  { path: "/compare", label: "Compare", icon: IconGitCompare },
  { path: "/trends", label: "Trends", icon: IconTrendingUp },
];

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Stack gap="xs">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          label={item.label}
          leftSection={<item.icon size={18} />}
          active={location.pathname.startsWith(item.path)}
          onClick={() => navigate(item.path)}
          variant="filled"
        />
      ))}
    </Stack>
  );
}

export default Sidebar;
