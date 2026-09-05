import { NavLink } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";

const NAV_ITEMS = [
  { to: "/", label: "Overview", end: true },
  { to: "/agents", label: "My agents" },
  { to: "/content", label: "Content" },
  { to: "/connections", label: "Connections" },
  { to: "/sales", label: "Sales" },
  { to: "/campaigns", label: "Campaigns" },
  { to: "/settings", label: "Settings" },
];

export function Sidebar() {
  const { user } = usePrivy();
  const email = user?.email?.address ?? user?.google?.email ?? "Creator";
  const initial = email.charAt(0).toUpperCase();

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="avatar-badge">P</div>
        <strong>Publisher
          <br />
          Agents</strong>
      </div>

      <div className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "active" : "")}>
            {item.label}
          </NavLink>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="avatar-badge" style={{ background: "#2563eb" }}>
          {initial}
        </div>
        <div>
          <div className="name">{email}</div>
          <div className="role">Creator account</div>
        </div>
      </div>
    </nav>
  );
}
