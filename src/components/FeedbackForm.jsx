import { useState } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import Button from './ui/Button';

export default function FeedbackForm({ job, onSubmit }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!rating || rating < 1 || rating > 5) return;

    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();

const { error } = await supabase
  .from("customer_feedback")
  .insert({
    job_id: job.id,
    customer_id: job.customer_id, // Defense-in-depth: required for RLS policy
    rating,
    comment,
    user_id: user.id, // ✅ required by policy
  });

    setSubmitting(false);
    if (!error) {
      onSubmit(); // refresh jobs
    } else {
      console.error('Error submitting feedback:', error.message);

toast.error('You already submitted feedback for this job.');
    }
  };

  return (
    <div className="p-2">
      <label className="text-sm">⭐ Rating:</label>
      <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="ml-2 border rounded px-2 py-1">
        {[1, 2, 3, 4, 5].map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <br />
      <textarea
        placeholder="Optional comments..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="mt-2 w-full border rounded px-2 py-1 text-sm"
        rows={2}
      />
      <Button
        onClick={handleSubmit}
        disabled={submitting}
        variant="primary"
        className="mt-2 text-sm"
      >
        {submitting ? 'Submitting...' : 'Submit Feedback'}
      </Button>
    </div>
  );
}