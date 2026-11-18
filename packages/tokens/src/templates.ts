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
    tagline: 'Appointments, doctors, and customer records',
    features: ['Service durations', 'Doctor selection', 'No-show tracking', 'Customer records'],
  },
  {
    id: 'teacher',
    title: 'Tutoring & Lessons',
    tagline: 'Book lessons with tutors in person or online',
    features: ['Tutor selection', 'Online sessions', 'Paid memberships', 'Lesson bookings'],
  },
  {
    id: 'sports',
    title: 'Courts & Facilities',
    tagline: 'Court selection and weekly availability',
    features: ['Court selection', 'Working hours', 'Multiple locations', 'Online checkout'],
  },
  {
    id: 'salon',
    title: 'Salon & Spa',
    tagline: 'Stylist selection and a priced service menu',
    features: ['Service menu', 'Stylist selection', 'Online checkout', 'Customer records'],
  },
  {
    id: 'therapist',
    title: 'Therapy',
    tagline: 'Book therapist appointments in person or online',
    features: ['Therapist selection', 'Online sessions', 'Availability', 'Customer records'],
  },
  {
    id: 'fitness',
    title: 'Personal Training',
    tagline: 'Trainer appointments and paid memberships',
    features: ['Session memberships', 'Trainer selection', 'Online sessions', 'Working hours'],
  },
];
