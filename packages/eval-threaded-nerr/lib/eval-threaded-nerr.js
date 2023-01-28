"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegexpModule = void 0;
const term_1 = require("@shexjs/term");
const UNBOUNDED = -1;
exports.RegexpModule = {
    name: "eval-threaded-nerr",
    description: "emulation of regular expression engine with error permutations",
    /* compile - compile regular expression and index triple constraints
     */
    compile: (_schema, shape, index) => {
        return new EvalThreadedNErrRegexEngine(shape, index); // not called if there's no expression
    }
};
class EvalThreadedNErrRegexEngine {
    constructor(shape, index) {
        this.shape = shape;
        this.index = index;
        this.outerExpression = shape.expression;
    }
    match(node, constraintToTripleMapping, semActHandler, _trace) {
        const allTriples = constraintToTripleMapping.reduce((allTriples, _tripleConstraint, tripleResult) => {
            tripleResult.forEach(res => allTriples.add(res.triple));
            return allTriples;
        }, new Set());
        const thisEvalThreadedNErrRegexEngine = this;
        /*
         * returns: list of passing or failing threads (no heterogeneous lists)
         */
        function validateExpr(expr, thread) {
            if (typeof expr === "string") { // Inclusion
                const included = thisEvalThreadedNErrRegexEngine.index.tripleExprs[expr];
                return validateExpr(included, thread);
            }
            let min = expr.min !== undefined ? expr.min : 1;
            let max = expr.max !== undefined ? expr.max === UNBOUNDED ? Infinity : expr.max : 1;
            function validateRept(groupTE, type, val) {
                let repeated = 0, errOut = false;
                let newThreads = [thread];
                const minmax = {};
                if (groupTE.min !== undefined && groupTE.min !== 1 || groupTE.max !== undefined && groupTE.max !== 1) {
                    minmax.min = groupTE.min;
                    minmax.max = groupTE.max;
                }
                if (groupTE.semActs !== undefined)
                    minmax.semActs = groupTE.semActs;
                if (groupTE.annotations !== undefined)
                    minmax.annotations = groupTE.annotations;
                for (; repeated < max && !errOut; ++repeated) {
                    let inner = [];
                    for (let t = 0; t < newThreads.length; ++t) {
                        const newt = newThreads[t];
                        const sub = val(newt);
                        if (sub.length > 0 && sub[0].errors.length === 0) { // all subs pass or all fail
                            sub.forEach(newThread => {
                                const solutions = newt.expression !== undefined ? newt.expression.solutions.slice() : [];
                                if (newThread.solution !== undefined)
                                    solutions.push(newThread.solution);
                                delete newThread.solution;
                                newThread.expression = Object.assign({
                                    type: type,
                                    solutions: solutions
                                }, minmax);
                            });
                        }
                        if (sub.length === 0 /* min:0 */ || sub[0].errors.length > 0)
                            return repeated < min ? sub : newThreads;
                        else
                            inner = inner.concat(sub);
                        // newThreads.expressions.push(sub);
                    }
                    newThreads = inner;
                }
                if (newThreads.length > 0 && newThreads[0].errors.length === 0 && groupTE.semActs !== undefined) {
                    const passes = [];
                    const failures = [];
                    newThreads.forEach(newThread => {
                        const semActErrors = semActHandler.dispatchAll(groupTE.semActs, "???", newThread);
                        if (semActErrors.length === 0) {
                            passes.push(newThread);
                        }
                        else {
                            Array.prototype.push.apply(newThread.errors, semActErrors);
                            failures.push(newThread);
                        }
                    });
                    newThreads = passes.length > 0 ? passes : failures;
                }
                return newThreads;
            }
            if (expr.type === "TripleConstraint") {
                const constraint = expr;
                if (thread.avail.get(constraint) === undefined)
                    thread.avail.set(constraint, constraintToTripleMapping.get(constraint).map(pair => pair.triple));
                const minmax = {};
                if (expr.min !== undefined && expr.min !== 1 || expr.max !== undefined && expr.max !== 1) {
                    minmax.min = expr.min;
                    minmax.max = expr.max;
                }
                if (expr.semActs !== undefined)
                    minmax.semActs = expr.semActs;
                if (expr.annotations !== undefined)
                    minmax.annotations = expr.annotations;
                const taken = thread.avail.get(constraint).splice(0, min);
                const passed = taken.length >= min;
                const ret = [];
                const matched = thread.matched;
                if (passed) {
                    do {
                        const passFail = taken.reduce((acc, triple) => {
                            const tested = {
                                type: "TestedTriple",
                                subject: (0, term_1.rdfJsTerm2Ld)(triple.subject),
                                predicate: (0, term_1.rdfJsTerm2Ld)(triple.predicate),
                                object: (0, term_1.rdfJsTerm2Ld)(triple.object)
                            };
                            const hit = constraintToTripleMapping.get(constraint).find(x => x.triple === triple); // will definitely find one
                            if (hit.res !== undefined)
                                tested.referenced = hit.res;
                            const semActErrors = thread.errors.concat(expr.semActs !== undefined
                                ? semActHandler.dispatchAll(expr.semActs, triple, tested)
                                : []);
                            if (semActErrors.length > 0)
                                acc.fail.push({ triple, tested, semActErrors });
                            else
                                acc.pass.push({ triple, tested, semActErrors });
                            return acc;
                        }, { pass: [], fail: [] });
                        // return an empty solution if min card was 0
                        if (passFail.fail.length === 0) {
                            // If we didn't take anything, fall back to old errors.
                            // Could do something fancy here with a semAct registration for negative matches.
                            const totalErrors = taken.length === 0 ? thread.errors.slice() : [];
                            const myThread = makeThread(expr, passFail.pass, totalErrors);
                            ret.push(myThread);
                        }
                        else {
                            passFail.fail.forEach(f => ret.push(makeThread(expr, [f], f.semActErrors)));
                        }
                        function makeThread(expr, tests, errors) {
                            return {
                                avail: new Map(thread.avail),
                                errors: errors,
                                matched: matched.concat({
                                    triples: tests.map(p => p.triple)
                                }),
                                expression: Object.assign({
                                    type: "TripleConstraintSolutions",
                                    predicate: expr.predicate
                                }, expr.valueExpr !== undefined ? { valueExpr: expr.valueExpr } : {}, expr.id !== undefined ? { productionLabel: expr.id } : {}, minmax, {
                                    solutions: tests.map(p => p.tested)
                                })
                            };
                        }
                    } while ((function () {
                        if (thread.avail.get(constraint).length > 0 && taken.length < max) {
                            // build another thread.
                            taken.push(thread.avail.get(constraint).shift());
                            return true;
                        }
                        else {
                            // no more threads
                            return false;
                        }
                    })());
                }
                else {
                    ret.push({
                        avail: thread.avail,
                        errors: thread.errors.concat([
                            Object.assign({
                                type: "MissingProperty",
                                property: expr.predicate
                            }, expr.valueExpr ? { valueExpr: expr.valueExpr } : {})
                        ]),
                        matched: matched
                    });
                }
                return ret;
            }
            else if (expr.type === "OneOf") {
                return validateRept(expr, "OneOfSolutions", (th) => {
                    // const accept = null;
                    const matched = [];
                    const failed = [];
                    expr.expressions.forEach(nested => {
                        const thcopy = {
                            avail: new Map(th.avail),
                            errors: th.errors,
                            matched: th.matched //.slice() ever needed??
                        };
                        const sub = validateExpr(nested, thcopy);
                        if (sub[0].errors.length === 0) { // all subs pass or all fail
                            Array.prototype.push.apply(matched, sub);
                            sub.forEach(newThread => {
                                const expressions = thcopy.solution !== undefined ? thcopy.solution.expressions : [];
                                if (newThread.expression !== undefined) // undefined for no matches on min card:0
                                    expressions.push(newThread.expression);
                                delete newThread.expression;
                                newThread.solution = {
                                    type: "OneOfSolution",
                                    expressions: expressions
                                };
                            });
                        }
                        else
                            Array.prototype.push.apply(failed, sub);
                    });
                    return matched.length > 0 ? matched : failed;
                });
            }
            else if (expr.type === "EachOf") {
                return homogenize(validateRept(expr, "EachOfSolutions", (th) => {
                    // Iterate through nested expressions, exprThreads starts as [th].
                    return expr.expressions.reduce((exprThreads, nested) => {
                        // Iterate through current thread list composing nextThreads.
                        // Consider e.g.
                        // <S1> { <p1> . | <p2> .; <p3> . } / { <x> <p2> 2; <p3> 3 } (should pass)
                        // <S1> { <p1> .; <p2> . }          / { <s1> <p1> 1 }        (should fail)
                        return homogenize(exprThreads.reduce((nextThreads, exprThread) => {
                            const sub = validateExpr(nested, exprThread);
                            // Move newThread.expression into a hierarchical solution structure.
                            sub.forEach(newThread => {
                                if (newThread.errors.length === 0) {
                                    const expressions = exprThread.solution !== undefined ? exprThread.solution.expressions.slice() : [];
                                    if (newThread.expression !== undefined) // undefined for no matches on min card:0
                                        expressions.push(newThread.expression);
                                    delete newThread.expression;
                                    newThread.solution = {
                                        type: "EachOfSolution",
                                        expressions: expressions // exprThread.expression + newThread.expression
                                    };
                                }
                            });
                            return nextThreads.concat(sub);
                        }, []));
                    }, [th]);
                }));
            }
            else {
                // runtimeError("unexpected expr type: " + expr.type);
                throw Error("how'd we get here?");
            }
            function homogenize(list) {
                return list.reduce((acc, elt) => {
                    if (elt.errors.length === 0) {
                        if (acc.errors) {
                            return { errors: false, l: [elt] };
                        }
                        else {
                            return { errors: false, l: acc.l.concat(elt) };
                        }
                    }
                    else {
                        if (acc.errors) {
                            return { errors: true, l: acc.l.concat(elt) };
                        }
                        else {
                            return acc;
                        }
                    }
                }, { errors: true, l: [] }).l;
            }
        }
        const startingThread = {
            avail: new Map(),
            matched: [],
            errors: [] // errors encounted
        };
        const ret = validateExpr(this.outerExpression, startingThread);
        // console.log(JSON.stringify(ret));
        // note: don't return if ret.length === 1 because it might fail the unmatchedTriples test.
        const longerChosen = ret.reduce((ret, elt) => {
            if (elt.errors.length > 0)
                return ret; // early return
            const unmatchedTriples = new Set(allTriples);
            // Removed triples matched in this thread.
            elt.matched.forEach(m => {
                m.triples.forEach(t => {
                    unmatchedTriples.delete(t);
                });
            });
            // Remaining triples are unaccounted for.
            unmatchedTriples.forEach(t => {
                elt.errors.push({
                    type: "ExcessTripleViolation",
                    triple: t,
                });
            });
            return ret !== null ? ret : // keep first solution
                // Accept thread with no unmatched triples.
                unmatchedTriples.size > 0 ? null : elt;
        }, null);
        return longerChosen !== null ?
            this.finish(longerChosen.expression) :
            ret.length > 1 ? {
                type: "PossibleErrors",
                errors: ret.reduce((all, e) => {
                    return all.concat([e.errors]);
                }, [])
            } : {
                type: "Failure",
                node: node,
                errors: ret[0].errors
            };
    }
    finish(fromValidatePoint) {
        if (this.shape.semActs !== undefined)
            fromValidatePoint.semActs = this.shape.semActs;
        return fromValidatePoint;
    }
}
//# sourceMappingURL=eval-threaded-nerr.js.map