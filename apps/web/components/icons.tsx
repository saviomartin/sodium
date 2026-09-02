/**
 * The Phosphor icon vocabulary for this app.
 *
 * Imported per icon from `@phosphor-icons/react/dist/ssr`: those builds carry
 * no "use client" directive, so one import works in both server and client
 * components, and the deep paths keep the 9,000-icon barrel out of the graph.
 *
 * Weight convention: `fill` for marks that read as objects (brands, status
 * pips, feature checks), `bold` for directional affordances (arrows, carets)
 * so they stay crisp at 14–16px, `regular` elsewhere.
 */

import type { SVGProps } from "react";

export { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
export { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowCounterClockwise";
export { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
export { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight";
export { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
export { ArrowUUpLeftIcon } from "@phosphor-icons/react/dist/ssr/ArrowUUpLeft";
export { BookBookmarkIcon } from "@phosphor-icons/react/dist/ssr/BookBookmark";
export { BroadcastIcon } from "@phosphor-icons/react/dist/ssr/Broadcast";
export { BuildingsIcon } from "@phosphor-icons/react/dist/ssr/Buildings";
export { ChartLineUpIcon } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
export { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
export { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
export { CircleDashedIcon } from "@phosphor-icons/react/dist/ssr/CircleDashed";
export { CircleNotchIcon } from "@phosphor-icons/react/dist/ssr/CircleNotch";
export { ClockIcon } from "@phosphor-icons/react/dist/ssr/Clock";
export { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
export { CodeIcon } from "@phosphor-icons/react/dist/ssr/Code";
export { CopyIcon } from "@phosphor-icons/react/dist/ssr/Copy";
export { CreditCardIcon } from "@phosphor-icons/react/dist/ssr/CreditCard";
export { CubeIcon } from "@phosphor-icons/react/dist/ssr/Cube";
export { EyeIcon } from "@phosphor-icons/react/dist/ssr/Eye";
export { FileCodeIcon } from "@phosphor-icons/react/dist/ssr/FileCode";
export { FlaskIcon } from "@phosphor-icons/react/dist/ssr/Flask";
export { FingerprintIcon } from "@phosphor-icons/react/dist/ssr/Fingerprint";
export { GearIcon } from "@phosphor-icons/react/dist/ssr/Gear";
export { GitBranchIcon } from "@phosphor-icons/react/dist/ssr/GitBranch";
export { GitCommitIcon } from "@phosphor-icons/react/dist/ssr/GitCommit";
export { GlobeIcon } from "@phosphor-icons/react/dist/ssr/Globe";
export { InfoIcon } from "@phosphor-icons/react/dist/ssr/Info";
export { KeyIcon } from "@phosphor-icons/react/dist/ssr/Key";
export { LightningIcon } from "@phosphor-icons/react/dist/ssr/Lightning";
export { ListChecksIcon } from "@phosphor-icons/react/dist/ssr/ListChecks";
export { LockSimpleIcon } from "@phosphor-icons/react/dist/ssr/LockSimple";
export { LockKeyIcon } from "@phosphor-icons/react/dist/ssr/LockKey";
export { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
export { MinusCircleIcon } from "@phosphor-icons/react/dist/ssr/MinusCircle";
export { PathIcon } from "@phosphor-icons/react/dist/ssr/Path";
export { PencilSimpleIcon } from "@phosphor-icons/react/dist/ssr/PencilSimple";
export { PlugsConnectedIcon } from "@phosphor-icons/react/dist/ssr/PlugsConnected";
export { PlusIcon } from "@phosphor-icons/react/dist/ssr/Plus";
export { ProhibitIcon } from "@phosphor-icons/react/dist/ssr/Prohibit";
export { PulseIcon } from "@phosphor-icons/react/dist/ssr/Pulse";
export { RobotIcon } from "@phosphor-icons/react/dist/ssr/Robot";
export { RocketLaunchIcon } from "@phosphor-icons/react/dist/ssr/RocketLaunch";
export { SealCheckIcon } from "@phosphor-icons/react/dist/ssr/SealCheck";
export { ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
export { SignOutIcon } from "@phosphor-icons/react/dist/ssr/SignOut";
export { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
export { StackIcon } from "@phosphor-icons/react/dist/ssr/Stack";
export { TargetIcon } from "@phosphor-icons/react/dist/ssr/Target";
export { TerminalWindowIcon } from "@phosphor-icons/react/dist/ssr/TerminalWindow";
export { TimerIcon } from "@phosphor-icons/react/dist/ssr/Timer";
export { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
export { WarningIcon } from "@phosphor-icons/react/dist/ssr/Warning";
export { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr/WarningCircle";
export { WrenchIcon } from "@phosphor-icons/react/dist/ssr/Wrench";
export { XIcon } from "@phosphor-icons/react/dist/ssr/X";
export { XCircleIcon } from "@phosphor-icons/react/dist/ssr/XCircle";

/**
 * GitHub's own Invertocat mark, at its published 98×96 geometry.
 *
 * Phosphor's `GithubLogo` is a look-alike drawn to that set's grid; wherever
 * this app names GitHub as the identity provider, it shows the real mark
 * instead. It fills with `currentColor`, so the call
 * site's text color decides whether it reads white on dark or dim inline.
 *
 * The mark is GitHub, Inc.'s trademark and appears here only to identify the
 * service the user is connecting.
 */
export function GithubMarkIcon({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 98 96"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      />
    </svg>
  );
}
