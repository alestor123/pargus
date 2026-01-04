import { MapUtils } from '../utils/MapUtils';

class NavigationService {
    constructor() {
        this.activeRoute = null;
        this.currentStepIndex = 0;
        this.lastAnnouncedStepIndex = -1;
    }

    startRoute(route) {
        this.activeRoute = route;
        this.currentStepIndex = 0;
        this.lastAnnouncedStepIndex = -1;
    }

    stopRoute() {
        this.activeRoute = null;
        this.currentStepIndex = 0;
    }

    updateProgress(currentLocation) {
        if (!this.activeRoute) return null;

        const currentStep = this.activeRoute.legs[0].steps[this.currentStepIndex];
        if (!currentStep) return null;

        const nextStep = this.activeRoute.legs[0].steps[this.currentStepIndex + 1];

        // Calculate distance to the NEXT maneuver waypoint
        const waypoint = currentStep.maneuver.location; // [lon, lat]
        const distanceToNext = MapUtils.getDistance(
            currentLocation.latitude,
            currentLocation.longitude,
            waypoint[1],
            waypoint[0]
        );

        // If we are close to the next waypoint (e.g., within 10 meters), advance step
        if (distanceToNext < 10) {
            this.currentStepIndex++;
        }

        // Return instruction if it's a new step or we are approaching (e.g., 50m away)
        if (this.currentStepIndex !== this.lastAnnouncedStepIndex) {
            this.lastAnnouncedStepIndex = this.currentStepIndex;
            return this.getInstructionForStep(this.currentStepIndex);
        }

        return null;
    }

    getInstructionForStep(index) {
        if (!this.activeRoute) return null;
        const step = this.activeRoute.legs[0].steps[index];
        if (!step) return "You have reached your destination.";

        const instruction = step.maneuver.instruction || "Continue straight";
        const distance = Math.round(step.distance);

        if (distance > 10) {
            return `${instruction} in ${distance} meters.`;
        }
        return instruction;
    }
}

export default new NavigationService();
