interface StarRatingProps {
  rating: number; // 1–5
}

/**
 * Read-only star display for a 1–5 rating.
 * Renders filled (★) and empty (☆) stars with an accessible label.
 */
export default function StarRating({ rating }: StarRatingProps) {
  const clamped = Math.max(0, Math.min(5, Math.round(rating)));
  const stars = '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
  return (
    <span aria-label={`${clamped} out of 5 stars`} title={`${clamped}/5`}>
      {stars}
    </span>
  );
}
