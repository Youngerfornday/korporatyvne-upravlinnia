/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Терміни, чиї поповери вже відрендерено на поточній сторінці (див. components/topic/Term.astro). */
    renderedTerms?: Set<string>;
  }
}
