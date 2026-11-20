import { createFileRoute, useParams } from "@tanstack/react-router";
import { LegalPageView } from "@/components/LegalPageView";

export const Route = createFileRoute("/legal/$slug")({
  component: LegalPageContainer,
  head: ({ params }) => {
    const documentName = params.slug.replace(/-/g, " ");
    const title = `${documentName} | BQ SQWAD TV`;
    const description = `Read the BQ SQWAD TV ${documentName} and current policy information.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "index, follow" },
      ],
    };
  },
});

function LegalPageContainer() {
  const { slug } = useParams({ from: "/legal/$slug" });
  return <LegalPageView slug={slug} />;
}
