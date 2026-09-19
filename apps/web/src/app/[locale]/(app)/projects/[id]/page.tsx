import { Suspense } from "react";
import { ProjectDetail } from "@/features/projects/components/project-detail";
import { ProjectDetailSkeleton } from "@/features/projects/components/skeletons";

/**
 * `id` has no generateStaticParams, so `params` as a whole is request data
 * here — awaiting it anywhere outside a boundary would block the prerender.
 * The page is therefore only the frame: the boundary and its skeleton ship
 * statically, and everything that needs the locale or the id streams in.
 */
export default function ProjectPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-container flex-col gap-6 px-4 py-12 md:px-8">
      <Suspense fallback={<ProjectDetailSkeleton />}>
        <ProjectDetail params={params} />
      </Suspense>
    </main>
  );
}
