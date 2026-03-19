import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";
import Button from "./components/ui/Button";

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("checking"); // checking | ready | saving | done | error
  const [error, setError] = useState("");

  useEffect(() => {
    // When opened from an invite/magic link, supabase-js processes the URL hash
    // and establishes a session. We poll once to confirm the session exists.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setStatus("ready");
      } else {
        setTimeout(async () => {
          const { data: { session: s2 } } = await supabase.auth.getSession();
          if (s2) setStatus("ready");
          else {
            setStatus("error");
            setError("Invite link invalid or expired. Please request a new invite.");
          }
        }, 600);
      }
    })();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setStatus("saving");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setStatus("ready");
      setError(err.message);
      return;
    }
    setStatus("done");
    // Send crew to the Worker Portal after setting a password
    navigate("/crew");
  };

  if (status === "checking") return <div className="p-8">Validating invite…</div>;
  if (status === "error") return <div className="p-8 text-red-600">{error}</div>;

  return (
    <div className="p-8 max-w-md">
      <h1 className="text-2xl font-bold mb-4">Set your password</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="password"
          className="border p-2 rounded w-full"
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button disabled={status === "saving"} variant="primary" className="px-4 py-2">
          {status === "saving" ? "Saving…" : "Save password"}
        </Button>
      </form>
      {error ? <p className="text-red-600 mt-3">{error}</p> : null}
    </div>
  );
}
