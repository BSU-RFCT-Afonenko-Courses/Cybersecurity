/** Shared owner envelopes. Imports here are types only, never lifecycle services. */
import type { View } from "../../domain/vocabulary.ts";
import type { BodySelection } from "../../body-export/model.ts";
import type { CaptureProjection } from "../capture-projections.ts";
import type { NavigationScope } from "../navigation.ts";
import type { PreparedPublicationAddresses } from "../publication-addresses.ts";
import type { NativeListingPlans } from "../native-listing.ts";
import type { NativeListingProviderBinding } from "../native-listing-provider.ts";
import type {
  ListingHashes,
  ListingPaths,
} from "../native-listing-evidence.ts";

export interface Coverage {
  kind: "root" | "include" | "resource";
  profiles?: View[];
  evidence: unknown;
}
export interface Audit {
  root: string;
  profiles: Record<string, any>;
  coverage: Record<string, Coverage>;
  excluded: string[];
  dependencies: Record<string, string>;
  nativeListingPlans?: NativeListingPlans;
  nativeListingProvider?: NativeListingProviderBinding;
  download?: { helper: string; directory: string };
  navigation?: {
    profile: View;
    scope: NavigationScope;
    document: any;
    members: {
      path: string;
      native: any;
      configHashes: Record<string, string>;
      download?: { helper: string; directory: string };
    }[];
    dormant: {
      path: string;
      native: any;
      configHashes: Record<string, string>;
      download?: { helper: string; directory: string };
    }[];
    addresses: {
      target: string;
      member: string;
      source: string;
      format: string;
    }[];
    rootAddresses: {
      target: string;
      member: string;
      source: string;
      format: string;
    }[];
  };
}
export interface PreparedOwner {
  protocol: 1;
  root: string;
  attemptId: string;
  profile: View;
  sessionId: string;
  sessionPath: string;
  sessionHash: string;
}
export interface OwnerResult {
  exitCode: 0 | 1 | 2;
  stage: string;
  report: Record<string, any>;
}
export interface Session {
  protocol: 1;
  root: string;
  attemptId: string;
  profile: View;
  sessionId: string;
  extension: string;
  quarto: string;
  audit: Audit;
  files: Record<string, string>;
  validated: boolean;
  captures: Record<string, string>;
  captureHashes: Record<string, string>;
  captureProjections: Record<string, CaptureProjection>;
  captureProjectionHash: string;
  identities: Record<string, string>;
  identityHashes: Record<string, string>;
  identityReaders: Record<string, string>;
  identityReplays: Record<string, true>;
  readerInputs: Record<string, string>;
  readerInputHashes: Record<string, string>;
  nativeListingPlans?: NativeListingPlans;
  nativeListingProvider?: NativeListingProviderBinding;
  nativeListingInputs?: ListingPaths;
  nativeListingWitnesses?: ListingPaths;
  nativeListingHashes?: ListingHashes;
  nativeListingServiceFiles?: Record<string, string>;
  publicationAddresses?: PreparedPublicationAddresses;
  headers: {
    id: string;
    source: { rootQmd: string; owner: string };
    ordinal: number;
    topLevel: boolean;
    level: number;
    title: string;
    titleJson: string;
    classes: string[];
    attributes: { key: string; value: string }[];
    ancestors: {
      id: string;
      classes: string[];
      attributes: { key: string; value: string }[];
    }[];
  }[];
  body?: BodySelection;
}
export interface Invocation {
  protocol: 1;
  root: string;
  attemptId: string;
  profile: View;
  sessionId: string;
  sessionPath: string;
  sessionHash: string;
  invocationId: string;
  phase: "capture" | "render";
  inputsHash: string;
  output: string;
  identity?: true;
}
export interface DownloadOwnership {
  protocol: 1;
  root: string;
  directory: string;
  files: {
    path: string;
    source: string;
    resources: string[];
    sha256: string;
  }[];
}
