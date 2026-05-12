import { getTagsForEntity, type TaggableType } from "@/app/actions/tags";
import { TagInput } from "./TagInput";

interface EntityTagsProps {
  type: TaggableType;
  id: number;
}

export async function EntityTags({ type, id }: EntityTagsProps) {
  const tags = await getTagsForEntity(type, id);
  return <TagInput taggableType={type} taggableId={id} initialTags={tags} />;
}
