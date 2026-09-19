import { Suspense } from "react";
import { EditProjectForm } from "@/features/projects/components/edit-project-form";
import { ProjectDetailSkeleton } from "@/features/projects/components/skeletons";

// See ../page.tsx: `params` is request data on this route, so the page is
// only the frame and the content streams in.
export default function EditProjectPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12 md:px-8">
      <Suspense fallback={<ProjectDetailSkeleton />}>
        <EditProjectForm params={params} />
      </Suspense>
    </main>
  );
}
