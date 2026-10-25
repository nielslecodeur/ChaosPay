import { publicReport, type Run } from "./report.js";

export function archiveRuns(value: unknown, name: string): Run[] {
  if (!value || typeof value !== "object") return [];
  const data = value as Record<string, unknown>;
  if (data.simulated !== false || typeof data.executedAt !== "string" || !Number.isFinite(Date.parse(data.executedAt))) return [];
  if (data.integration === "invoice-check") {
    if (!Array.isArray(data.scenarios) || typeof data.package !== "string" || !/^@chaospay\/recovery@[0-9.]+$/.test(data.package) ||
        typeof data.archiveSha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.archiveSha256)) return [];
    return data.scenarios.map((entry: unknown) => {
      if (!entry || typeof entry !== "object") throw new Error("Invalid integration scenario");
      const s = entry as Record<string,unknown>;
      if (!["baseline","drop","crash","confirmation-lost"].includes(String(s.scenario)) ||
          !Number.isSafeInteger(s.authorizationCount) || Number(s.authorizationCount)<1 ||
          typeof s.originalAuthorizationReused !== "boolean") throw new Error("Invalid integration proof");
      const after=publicReport(s.after);
      const before=s.before == null ? undefined : publicReport(s.before);
      if (after.serviceId !== "invoice-check" || (before && before.purchaseId !== after.purchaseId)) throw new Error("Mismatched integration report");
      return {
        runId:name+"--"+s.scenario,source:"ARCHIVE",scenario:String(s.scenario),status:"COMPLETE",startedAt:data.executedAt,
        reports:[after],checkpoints:before?[before]:[],timeline:[],
        integrationEvidence:{package:data.package,archiveSha256:data.archiveSha256,authorizationCount:s.authorizationCount,originalAuthorizationReused:s.originalAuthorizationReused},
      } as Run;
    });
  }
  if (!data.reports || typeof data.reports !== "object" || Array.isArray(data.reports)) return [];
  return [{runId:name,source:"ARCHIVE",scenario:"campagne moteur A",status:"COMPLETE",startedAt:data.executedAt,
    timeline:[],reports:Object.values(data.reports).map(publicReport)}];
}
