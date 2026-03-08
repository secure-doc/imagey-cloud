import Panel from "../components/Panel";
import { ImageActivity } from "./Activity";
import ImageComponent from "../components/ImageComponent";

export default function ImagePanel({
  className,
  activity,
}: {
  className?: string;
  activity: ImageActivity;
}) {
  return (
    <Panel
      className={className}
      title={activity.image.name}
      image={<ImageComponent image={activity.image} />}
    ></Panel>
  );
}
