import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-core");
import { diagnostic } from "../domain/diagnostics.ts";
import { decodeAnswerYaml, projectAnswer } from "../document/answers.ts";
import { AnswerFactsSchema } from "../document/answer-contracts.ts";
import type { Node } from "./model.ts";
export async function validateAnswer(source: string, context: {source?: string; id?: string} = {}) {
  try {
    const data = decodeAnswerYaml(source, context.source ?? "answer");
    return {publicAnswer: projectAnswer(data), closedKey: data, answerType: data.type};
  } catch (cause) {
    if (!cause || typeof cause !== "object" || !("code" in cause) || !String(cause.code).startsWith("ANSWER_")) throw cause;
    throw diagnostic(String(cause.code), cause instanceof Error ? cause.message : String(cause), {...context, field: "answer"}, cause);
  }
}

export async function projectChoice(b: Node, context: {source?: string; id?: string} = {}) {
  if (
    !b.c[0][2].some((x: any) => x[0] === "type" && x[1] === "single-choice") ||
    b.c[1].length !== 1 || b.c[1][0].t !== "BulletList"
  ) throw diagnostic("ADAPTER", "Компонент Core/projectChoice: неподдерживаемая структура ответа single-choice", {...context, field: "answer"});
  let correct = -1, count = 0;
  const strip = (v: any, index: number): any => {
    if (Array.isArray(v)) {
      return v.flatMap((x) => {
        if (x?.t === "Span" && x.c[0][1].includes("correct")) {
          correct = index;
          count++;
          return strip(x.c[1], index);
        }
        return [strip(x, index)];
      });
    }
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, strip(x, index)]),
      );
    }
    return v;
  };
  const clean = b.c[1][0].c.map((c: any, i: number) => strip(c, i));
  const parsed = AnswerFactsSchema.safeParse({type: "single-choice", count: clean.length, correct});
  if (count !== 1 || !parsed.success) {
    throw diagnostic("ANSWER_INVALID", "single-choice требует ровно один correct и не менее двух вариантов", {...context, field: "answer"}, parsed.success ? undefined : parsed.error);
  }
  return {
    answerType: "single-choice",
    closedKey: { correct },
    publicAnswer: [{ t: "BulletList", c: clean }],
  };
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
validateAnswer=__metrics.wrapAsync({id:"course-core.body-export.answer.validateAnswer",kind:"phase"},validateAnswer);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
projectChoice=__metrics.wrapAsync({id:"course-core.body-export.answer.projectChoice",kind:"phase"},projectChoice);
