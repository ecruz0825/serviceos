// src/components/SupportModeBanner.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useUser } from "../context/UserContext";

export default function SupportModeBanner() {
  const { supportMode, supportTargetCompanyId, supportStartedAt, supportReason, refreshUserContext } = useUser();
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);

  if (!supportMode) {
    return null;
  }

  const handleExitSupportMode = async () => {
    setExiting(true);
    try {
      const { error } = await supabase.rpc("end_support_session");

      if (error) {
        console.error("Error ending support session:", error);
        alert("Failed to exit support mode. Please try again.");
        setExiting(false);
        return;
      }

      // Refresh user context to clear support mode state before navigation
      await refreshUserContext();

      // Navigate to platform dashboard
      navigate("/platform");
    } catch (err) {
      console.error("Unexpected error ending support session:", err);
      alert("Failed to exit support mode. Please try again.");
      setExiting(false);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const formatCompanyId = (id) => {
    if (!id) return "";
    // Show first 8 characters of UUID for compact display
    return id.substring(0, 8) + "...";
  };

  return (
    <div className="bg-amber-100 border-b border-amber-300 px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">
            Support Mode — Read Only — You are viewing this app as a tenant admin for support purposes. Changes are disabled except approved diagnostic actions.
          </p>
          <div className="mt-1 text-xs text-amber-800">
            {supportTargetCompanyId && (
              <span className="mr-4">
                Company: <span className="font-mono">{formatCompanyId(supportTargetCompanyId)}</span>
              </span>
            )}
            {supportStartedAt && (
              <span className="mr-4">
                Started: {formatDateTime(supportStartedAt)}
              </span>
            )}
            {supportReason && (
              <span>Reason: {supportReason}</span>
            )}
          </div>
        </div>
        <button
          onClick={handleExitSupportMode}
          disabled={exiting}
          className="px-4 py-1.5 text-sm font-medium text-amber-900 bg-amber-200 hover:bg-amber-300 border border-amber-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exiting ? "Exiting..." : "Exit Support Mode"}
        </button>
      </div>
    </div>
  );
}
