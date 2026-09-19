"use client";

import { Button } from "@repo/ui/components/base/buttons/button";
import { X } from "@repo/ui/icons";
import { cx } from "@repo/ui/utils/cx";
import {
  Button as AriaButton,
  Text,
  UNSTABLE_Toast as Toast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion,
} from "react-aria-components";

/**
 * What a toast carries. Strings arrive already translated — the queue has no
 * locale — and an optional action is what an "undo" is.
 */
export type ToastMessage = {
  title: string;
  description?: string;
  tone?: "neutral" | "success" | "error";
  action?: {
    label: string;
    onAction: () => void;
  };
};

export type ToastOptions = {
  /** Milliseconds before auto-dismiss. React Aria pauses it on hover and focus. */
  timeout?: number;
};

const DEFAULT_TIMEOUT = 6000;

/**
 * One queue for the whole app, so a toast raised just before a navigation
 * survives it. Mount `<Toaster>` once, near the root.
 */
export const toastQueue = new ToastQueue<ToastMessage>({ maxVisibleToasts: 3 });

/** Show a toast. Returns the key, for `toastQueue.close(key)`. */
export function toast(message: ToastMessage, options: ToastOptions = {}): string {
  return toastQueue.add(message, { timeout: options.timeout ?? DEFAULT_TIMEOUT });
}

export type ToasterLabels = {
  /** Accessible name of the region. */
  region: string;
  close: string;
};

export const defaultToasterLabels: ToasterLabels = {
  region: "Notifications",
  close: "Close",
};

const tones = {
  neutral: "text-primary",
  success: "text-success-primary",
  error: "text-error-primary",
} as const;

/**
 * Renders the queue. React Aria owns the live region, focus management and
 * the timers; this is only the markup.
 */
export function Toaster({ labels: labelOverrides }: { labels?: Partial<ToasterLabels> }) {
  const labels = { ...defaultToasterLabels, ...labelOverrides };

  return (
    <ToastRegion
      queue={toastQueue}
      aria-label={labels.region}
      className="fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3 outline-hidden"
    >
      {({ toast: item }) => (
        <Toast
          toast={item}
          className="flex items-start gap-3 rounded-xl bg-primary p-4 shadow-lg ring-1 ring-secondary outline-brand focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ToastContent className="flex min-w-0 flex-1 flex-col gap-1">
            <Text
              slot="title"
              className={cx("text-sm font-semibold", tones[item.content.tone ?? "neutral"])}
            >
              {item.content.title}
            </Text>
            {item.content.description && (
              <Text slot="description" className="text-sm text-tertiary">
                {item.content.description}
              </Text>
            )}
            {item.content.action && (
              <div className="pt-1">
                <Button
                  color="link-color"
                  size="sm"
                  onPress={() => {
                    item.content.action?.onAction();
                    toastQueue.close(item.key);
                  }}
                >
                  {item.content.action.label}
                </Button>
              </div>
            )}
          </ToastContent>
          <AriaButton
            slot="close"
            aria-label={labels.close}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-quaternary outline-brand hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2"
          >
            <X className="pointer-events-none size-4" />
          </AriaButton>
        </Toast>
      )}
    </ToastRegion>
  );
}
