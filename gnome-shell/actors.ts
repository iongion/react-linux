import type { GnomeShellActor, GnomeShellObject } from "./types";

export function isActorLike(value: unknown): value is GnomeShellActor {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const actor = value as GnomeShellActor;
  return (
    typeof actor.add_child === "function" ||
    typeof actor.add_actor === "function" ||
    typeof actor.get_children === "function" ||
    typeof actor.insert_child_at_index === "function" ||
    typeof actor.set_child === "function"
  );
}

export function actorForObject(object: GnomeShellActor | GnomeShellObject): GnomeShellActor {
  if (isActorLike(object)) {
    return object;
  }
  if (typeof object === "object" && object !== null && "actor" in object && object.actor) {
    return object.actor as GnomeShellActor;
  }
  return object as GnomeShellActor;
}
