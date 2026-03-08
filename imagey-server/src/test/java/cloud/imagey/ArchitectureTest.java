/*
 * This file is part of Imagey.
 *
 * Imagey is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Imagey is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Imagey.  If not, see <http://www.gnu.org/licenses/>.
 */
package cloud.imagey;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import javax.annotation.security.PermitAll;
import javax.annotation.security.RolesAllowed;
import javax.ws.rs.DELETE;
import javax.ws.rs.GET;
import javax.ws.rs.HEAD;
import javax.ws.rs.OPTIONS;
import javax.ws.rs.PATCH;
import javax.ws.rs.POST;
import javax.ws.rs.PUT;

import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

@AnalyzeClasses(packages = "cloud.imagey")
public class ArchitectureTest {
    @ArchTest
    private static ArchRule noCycles = slices().matching("cloud.imagey.(*)..").should().beFreeOfCycles();
    @ArchTest
    private static ArchRule secured = methods()
        .that()
        .areAnnotatedWith(GET.class)
        .or().areAnnotatedWith(POST.class)
        .or().areAnnotatedWith(PUT.class)
        .or().areAnnotatedWith(DELETE.class)
        .or().areAnnotatedWith(PATCH.class)
        .or().areAnnotatedWith(HEAD.class)
        .or().areAnnotatedWith(OPTIONS.class)
        .should()
        .beAnnotatedWith(RolesAllowed.class)
        .orShould().beAnnotatedWith(PermitAll.class);
}
