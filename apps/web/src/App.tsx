import { useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { AppShell, ConsolePopoutShell, isConsolePopoutPath } from "./AppShell";
import { AuthenticatedRoutes, AuthLoadingScreen, isPublicPath, PublicRoutes } from "./routes";

export function App() {
  const { loading, authenticated, user } = useAuth();
  const location = useLocation();

  const popoutConsole = isConsolePopoutPath(location.pathname);

  if (!authenticated) {
    // Login/register/legal render immediately — do not wait on /api/auth/me.
    // For "/" and other protected paths, wait for the session check to avoid a login flash.
    if (isPublicPath(location.pathname) || !loading) {
      return <PublicRoutes />;
    }
    return <AuthLoadingScreen />;
  }

  const Layout = popoutConsole ? ConsolePopoutShell : AppShell;

  return (
    <Layout>
      <AuthenticatedRoutes user={user} />
    </Layout>
  );
}
