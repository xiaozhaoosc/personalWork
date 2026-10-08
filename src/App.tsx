import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Skills from './pages/Skills';
import Experts from './pages/Experts';
import Tasks from './pages/Tasks';
import Automations from './pages/Automations';
import Settings from './pages/Settings';

const nav = [
  { to: '/', label: '总览', icon: '🏠', end: true },
  { to: '/skills', label: '技能中心', icon: '🧩' },
  { to: '/experts', label: '专家目录', icon: '🧠' },
  { to: '/tasks', label: '任务 / 待办', icon: '✅' },
  { to: '/automations', label: '自动化', icon: '⚙️' },
  { to: '/settings', label: '设置', icon: '🔧' },
];

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          个人工作台
          <small>Personal Workbench</small>
        </div>
        <nav className="nav">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/experts" element={<Experts />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
