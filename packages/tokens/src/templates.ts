import type { ProfessionId } from './professions';

export type Template = {
  id: ProfessionId;
  title: string;
  tagline: string;
  features: string[];
};

export const TEMPLATES: Template[] = [
  {
    id: 'doctor',
    title: 'Clinic & Healthcare',
    tagline: 'Appointments, intake forms, repeat patients',
    features: ['30/45-min slots', 'Patient intake', 'Insurance fields', 'No-show tracking'],
  },
  {
    id: 'teacher',
    title: 'Tutoring & Lessons',
    tagline: 'Recurring sessions, homework, group classes',
    features: ['Recurring lessons', 'Homework attach', 'Group classes', 'Parent contact'],
  },
  {
    id: 'sports',
    title: 'Courts & Facilities',
    tagline: 'Multi-resource, equipment, peak pricing',
    features: ['Multi-resource', 'Equipment rental', 'Peak hours', 'Coach add-on'],
  },
  {
    id: 'salon',
    title: 'Salon & Spa',
    tagline: 'Stylist preference, service menu, deposits',
    features: ['Service menu', 'Stylist pick', 'Deposits', 'Tips'],
  },
  {
    id: 'therapist',
    title: 'Therapy',
    tagline: 'Confidential intake, recurring sessions',
    features: ['Private intake', 'Continuing care', 'Telehealth', 'Sliding scale'],
  },
  {
    id: 'fitness',
    title: 'Personal Training',
    tagline: 'Goal-based, packages, streaks',
    features: ['Session packages', 'Goal tracking', 'Streaks', 'Class drop-in'],
  },
];
