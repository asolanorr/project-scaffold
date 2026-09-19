import {
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  GoogleIcon,
  HelpCircleIcon,
  InformationCircleIcon,
  Logout01Icon,
  Search01Icon,
  Tick02Icon,
  UnfoldMoreIcon,
  UserIcon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ComponentPropsWithoutRef, FC } from "react";

/**
 * The icon layer.
 *
 * This is the only file in the repository that imports `@hugeicons/react` or
 * `@hugeicons/core-free-icons`. Everything else — the Untitled UI components
 * copied into this package, feature code in `apps/web` — imports named icons
 * from `@repo/ui/icons`, so swapping the icon set later is a change to this
 * file and nothing else.
 *
 * Each export is a plain component with the same shape the Untitled UI
 * components expect (`FC<{ className?: string }>`), which is why the components
 * can take `icon={Eye}` untouched. Hugeicons ships a single `HugeiconsIcon`
 * renderer plus data for each glyph; the wrapper binds the two.
 *
 * Names follow Untitled UI's icon names where one exists (`Eye`, `HelpCircle`)
 * so a component added with the CLI needs only its import line changed.
 */
export type IconProps = Omit<ComponentPropsWithoutRef<"svg">, "children"> & {
  /** Rendered width and height. Prefer sizing with a class (`size-5`). */
  size?: number | string;
  /** Stroke width in the 24px viewBox. Defaults to 2 to match Untitled UI. */
  strokeWidth?: number;
};

export type Icon = FC<IconProps>;

function createIcon(displayName: string, svg: IconSvgElement): Icon {
  const Component: Icon = ({ strokeWidth = 2, ...props }) => (
    // The Untitled UI components size icons with `size-*` classes. CSS wins
    // over the width/height attributes HugeiconsIcon writes, so no `size` prop
    // is needed for that to work.
    <HugeiconsIcon icon={svg} strokeWidth={strokeWidth} aria-hidden="true" {...props} />
  );
  Component.displayName = displayName;
  return Component;
}

// Form fields
export const Eye = createIcon("Eye", ViewIcon);
export const EyeOff = createIcon("EyeOff", ViewOffIcon);
export const HelpCircle = createIcon("HelpCircle", HelpCircleIcon);
export const InfoCircle = createIcon("InfoCircle", InformationCircleIcon);

// Tables, selects and dialogs
export const ArrowDown = createIcon("ArrowDown", ArrowDown02Icon);
export const ChevronDown = createIcon("ChevronDown", ArrowDown01Icon);
export const Check = createIcon("Check", Tick02Icon);
export const SearchLg = createIcon("SearchLg", Search01Icon);
export const User01 = createIcon("User01", UserIcon);
export const ChevronSelectorVertical = createIcon("ChevronSelectorVertical", UnfoldMoreIcon);
export const X = createIcon("X", Cancel01Icon);

// Navigation and auth
export const ArrowLeft = createIcon("ArrowLeft", ArrowLeft01Icon);
export const ArrowRight = createIcon("ArrowRight", ArrowRight01Icon);
export const LogOut = createIcon("LogOut", Logout01Icon);
export const Google = createIcon("Google", GoogleIcon);
