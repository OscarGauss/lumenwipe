import type { PlannedStep } from "@/types/plan";
import StepCard from "./StepCard";

interface ExecutionPlanListProps {
  steps: PlannedStep[];
  activeIndex?: number;
}

export default function ExecutionPlanList({ steps, activeIndex }: ExecutionPlanListProps) {
  return (
    <div className="space-y-2">
      {steps.map((step) => (
        <StepCard
          key={step.index}
          step={step}
          isActive={step.index === activeIndex}
        />
      ))}
    </div>
  );
}
