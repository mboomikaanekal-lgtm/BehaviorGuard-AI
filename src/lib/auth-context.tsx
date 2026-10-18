import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, type ApiUser, type AuthResponse } from "@/lib/api";

interface AuthContextValue {
  user: ApiUser | null;
  session: { access_token: string } | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "behaviorguard_access_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);

    if (!token) {
      setLoading(false);
      return;
    }

    apiRequest<ApiUser>("/api/auth/me", {}, token)
      .then((currentUser) => {
        setUser(currentUser);
        setSession({ access_token: token });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const authenticate = async (
    endpoint: "/api/auth/login" | "/api/auth/register",
    email: string,
    password: string,
  ): Promise<{ error: string | null }> => {
    try {
      const result = await apiRequest<AuthResponse>(endpoint, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      localStorage.setItem(TOKEN_KEY, result.access_token);
      setUser(result.user);
      setSession({ access_token: result.access_token });

      return { error: null };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Authentication failed",
      };
    }
  };

  const signIn = (email: string, password: string) =>
    authenticate("/api/auth/login", email, password);

  const signUp = (email: string, password: string) =>
    authenticate("/api/auth/register", email, password);

  const signOut = async () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}