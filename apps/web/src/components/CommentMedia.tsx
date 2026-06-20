/**
 * Rend le média éventuel d'un commentaire : image jointe et/ou GIF.
 * Les `<img>` pointent vers `/images/:id` (les GIF s'animent).
 */
export function CommentMedia({
  image,
  gifUrl,
}: {
  image?: { id: string } | null;
  gifUrl?: string | null;
}) {
  if (!image && !gifUrl) return null;
  return (
    <div className="flex flex-col gap-1 mt-1.5">
      {image && (
        <a href={`/images/${image.id}`} target="_blank" rel="noreferrer">
          <img
            src={`/images/${image.id}`}
            alt=""
            className="block rounded-lg max-w-full max-h-[260px] object-cover"
          />
        </a>
      )}
      {gifUrl && (
        <img
          src={gifUrl}
          alt=""
          className="block rounded-lg max-w-full max-h-[260px] object-cover"
        />
      )}
    </div>
  );
}
