import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', loadComponent: () => import('./home/home.page').then(m => m.HomePage) },
  { path: 'location', loadComponent: () => import('./location/location.page').then(m => m.LocationPage) },
  { path: 'signup', loadComponent: () => import('./signup/signup.page').then(m => m.SignupPage) },
  { path: 'login', loadComponent: () => import('./login/login.page').then(m => m.LoginPage) }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}