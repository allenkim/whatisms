"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SnapTradeReact } from "snaptrade-react";
import { apiUrl } from "@/lib/api";

export default function SnapTradeLinkButton() {
  const router = useRouter();
  const [loginLink, setLoginLink] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{
    userId: string;
    userSecret: string;
  } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLoginLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/snaptrade/create-login-link"), {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to create login link");
      const data = await res.json();
      setLoginLink(data.loginLink);
      setCredentials({ userId: data.userId, userSecret: data.userSecret });
      setIsOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setLoginLink(null);
  }, []);

  const onSuccess = useCallback(
    async (authorizationId: string) => {
      setIsOpen(false);
      setLoading(true);
      setError(null);
      try {
        // Register the connection
        const res = await fetch(apiUrl("/api/snaptrade/callback"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            authorizationId,
            userId: credentials?.userId,
            userSecret: credentials?.userSecret,
          }),
        });

        if (!res.ok) throw new Error("Failed to connect account");

        const data = await res.json();

        // Sync holdings immediately after connecting
        await fetch(apiUrl("/api/snaptrade/sync"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapTradeConnectionId: data.snapTradeConnectionId,
          }),
        });

        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
      } finally {
        setLoading(false);
        setLoginLink(null);
        setCredentials(null);
      }
    },
    [credentials, router]
  );

  return (
    <div>
      {error && <p className="text-sm text-danger mb-2">{error}</p>}
      <button
        onClick={fetchLoginLink}
        disabled={loading}
        className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {loading ? "Connecting..." : "Connect Brokerage (SnapTrade)"}
      </button>
      {loginLink && (
        <SnapTradeReact
          loginLink={loginLink}
          isOpen={isOpen}
          close={handleClose}
          onSuccess={onSuccess}
          onError={(data) => {
            setError(data.detail || "Connection failed");
            handleClose();
          }}
          onExit={handleClose}
        />
      )}
    </div>
  );
}
